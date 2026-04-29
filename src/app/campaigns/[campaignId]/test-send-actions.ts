"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import { getCampaign } from "@/lib/campaigns";
import { requireEnv } from "@/lib/env";
import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import { isGmailAuthError, sendGmailMessage, type GmailSendResult } from "@/lib/google/gmail";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  getSendSuppressionStatus,
} from "@/lib/unsubscribe";
import {
  buildTemplateContext,
  renderTemplate,
  renderTemplateBodyWithUnsubscribe,
} from "@/lib/templates";
import {
  getCampaignColumnMapping,
  validateCampaignSheet,
} from "@/lib/sheets";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type SavedSequenceStepRow = {
  id: string;
  campaign_id: string;
  step_number: number;
  name: string;
  subject_template: string;
  body_template: string;
};

type SendHistoryStatus = "sent" | "failed" | "skipped";

type SendHistoryPayload = {
  bodyRendered: string;
  campaignId: string;
  errorMessage?: string;
  gmailMessageId?: string;
  gmailThreadId?: string | null;
  recipientEmail: string;
  recipientRowNumber: number;
  recipientSnapshot: Record<string, unknown>;
  sequenceStepId: string;
  status: SendHistoryStatus;
  subjectRendered: string;
  token: string;
};

export async function sendOwnerTestEmail(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const sequenceStepNumber = readPositiveInteger(formData, "sequenceStepNumber");
  const previewRowIndex = readNonNegativeInteger(formData, "previewRowIndex");
  const recipientEmail = normalizeEmail(readRequiredString(formData, "testRecipientEmail"));
  const ownerEmail = normalizeEmail(requireEnv("APP_OWNER_EMAIL"));
  const ownerControlledConfirmed = formData.get("confirmOwnerControlled") === "on";

  if (!isEmail(recipientEmail)) {
    redirect(`/campaigns/${campaignId}?testSend=invalid-recipient`);
  }

  if (recipientEmail !== ownerEmail && !ownerControlledConfirmed) {
    redirect(`/campaigns/${campaignId}?testSend=owner-confirmation-required`);
  }

  const campaign = await getCampaign(campaignId);

  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    redirect(`/campaigns/${campaignId}?testSend=missing-config`);
  }

  const [mapping, sequenceStep] = await Promise.all([
    getCampaignColumnMapping(campaignId),
    getSavedSequenceStep(campaignId, sequenceStepNumber),
  ]);

  if (!sequenceStep || !sequenceStep.subject_template.trim() || !sequenceStep.body_template.trim()) {
    redirect(`/campaigns/${campaignId}?testSend=missing-template`);
  }

  const validation = await validateCampaignSheet({
    googleAccountId: campaign.googleAccountId,
    sheetId: campaign.sheetId,
    worksheetName: campaign.worksheetName,
    mapping,
  });

  if (validation.error || validation.headers.length === 0 || validation.previewRows.length === 0) {
    redirect(`/campaigns/${campaignId}?testSend=sheet-invalid`);
  }

  const selectedRow = validation.previewRows[previewRowIndex];

  if (!selectedRow) {
    redirect(`/campaigns/${campaignId}?testSend=missing-row`);
  }

  const token = generateUnsubscribeToken();
  const unsubscribeUrl = buildUnsubscribeUrl(token);
  const context = buildTemplateContext(validation.headers, selectedRow);
  const renderedSubject = renderTemplate(sequenceStep.subject_template, context);
  const renderedBody = renderTemplateBodyWithUnsubscribe({
    bodyTemplate: sequenceStep.body_template,
    context,
    unsubscribeUrl,
  });
  const missingColumns = Array.from(
    new Set([...renderedSubject.missingColumns, ...renderedBody.missingColumns]),
  );
  const recipientSnapshot = buildRecipientSnapshot({
    headers: validation.headers,
    previewRowIndex,
    row: selectedRow,
    sequenceStepNumber,
    testSend: true,
  });

  if (missingColumns.length > 0) {
    await insertSendHistory({
      bodyRendered: renderedBody.output,
      campaignId,
      errorMessage: `Template references missing columns: ${missingColumns.join(", ")}`,
      recipientEmail,
      recipientRowNumber: previewRowIndex + 2,
      recipientSnapshot,
      sequenceStepId: sequenceStep.id,
      status: "skipped",
      subjectRendered: renderedSubject.output,
      token,
    });
    revalidateCampaign(campaignId);
    redirect(`/campaigns/${campaignId}?testSend=missing-columns`);
  }

  const suppressionStatus = await getSendSuppressionStatus(recipientEmail);

  if (suppressionStatus.suppressed) {
    await insertSendHistory({
      bodyRendered: renderedBody.output,
      campaignId,
      errorMessage: `Suppressed recipient: ${suppressionStatus.reason}`,
      recipientEmail,
      recipientRowNumber: previewRowIndex + 2,
      recipientSnapshot,
      sequenceStepId: sequenceStep.id,
      status: "skipped",
      subjectRendered: renderedSubject.output,
      token,
    });
    revalidateCampaign(campaignId);
    redirect(`/campaigns/${campaignId}?testSend=skipped`);
  }

  let gmailResult: GmailSendResult;

  try {
    gmailResult = await sendTestMessageWithRefresh({
      body: renderedBody.output,
      campaignGoogleAccountId: campaign.googleAccountId,
      recipientEmail,
      subject: renderedSubject.output,
    });
  } catch (error) {
    await insertSendHistory({
      bodyRendered: renderedBody.output,
      campaignId,
      errorMessage: error instanceof Error ? error.message : "Gmail test send failed.",
      recipientEmail,
      recipientRowNumber: previewRowIndex + 2,
      recipientSnapshot,
      sequenceStepId: sequenceStep.id,
      status: "failed",
      subjectRendered: renderedSubject.output,
      token,
    });
    revalidateCampaign(campaignId);
    redirect(`/campaigns/${campaignId}?testSend=failed`);
  }

  await insertSendHistory({
    bodyRendered: renderedBody.output,
    campaignId,
    gmailMessageId: gmailResult.messageId,
    gmailThreadId: gmailResult.threadId,
    recipientEmail,
    recipientRowNumber: previewRowIndex + 2,
    recipientSnapshot,
    sequenceStepId: sequenceStep.id,
    status: "sent",
    subjectRendered: renderedSubject.output,
    token,
  });
  revalidateCampaign(campaignId);
  redirect(`/campaigns/${campaignId}?testSend=sent`);
}

async function sendTestMessageWithRefresh({
  body,
  campaignGoogleAccountId,
  recipientEmail,
  subject,
}: {
  body: string;
  campaignGoogleAccountId: string;
  recipientEmail: string;
  subject: string;
}) {
  const accessToken = await getValidGoogleAccessToken(campaignGoogleAccountId);

  try {
    return await sendGmailMessage({
      accessToken,
      htmlBody: body,
      subject,
      to: recipientEmail,
    });
  } catch (error) {
    if (!isGmailAuthError(error)) {
      throw error;
    }

    return sendGmailMessage({
      accessToken: await refreshGoogleAccessToken(campaignGoogleAccountId),
      htmlBody: body,
      subject,
      to: recipientEmail,
    });
  }
}

async function getSavedSequenceStep(
  campaignId: string,
  stepNumber: number,
): Promise<SavedSequenceStepRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sequence_steps")
    .select("id, campaign_id, step_number, name, subject_template, body_template")
    .eq("campaign_id", campaignId)
    .eq("step_number", stepNumber)
    .maybeSingle<SavedSequenceStepRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function insertSendHistory(payload: SendHistoryPayload) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("send_history").insert({
    body_rendered: payload.bodyRendered,
    campaign_id: payload.campaignId,
    error_message: payload.errorMessage ?? null,
    gmail_message_id: payload.gmailMessageId ?? null,
    gmail_thread_id: payload.gmailThreadId ?? null,
    recipient_email: payload.recipientEmail,
    recipient_row_number: payload.recipientRowNumber,
    recipient_snapshot: payload.recipientSnapshot,
    send_type: "test",
    sent_at: payload.status === "sent" ? new Date().toISOString() : null,
    sequence_step_id: payload.sequenceStepId,
    status: payload.status,
    subject_rendered: payload.subjectRendered,
    unsubscribe_token: payload.token,
  });

  if (error) {
    throw error;
  }
}

function buildRecipientSnapshot({
  headers,
  previewRowIndex,
  row,
  sequenceStepNumber,
  testSend,
}: {
  headers: string[];
  previewRowIndex: number;
  row: string[];
  sequenceStepNumber: number;
  testSend: boolean;
}): Record<string, unknown> {
  return {
    rowNumber: previewRowIndex + 2,
    sequenceStepNumber,
    testSend,
    values: Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  };
}

function readRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function readPositiveInteger(formData: FormData, key: string): number {
  const value = Number.parseInt(readRequiredString(formData, key), 10);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return value;
}

function readNonNegativeInteger(formData: FormData, key: string): number {
  const value = Number.parseInt(readRequiredString(formData, key), 10);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }

  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function revalidateCampaign(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
}
