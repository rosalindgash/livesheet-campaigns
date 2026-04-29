import { getCampaign, type Campaign } from "@/lib/campaigns";
import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import { isGmailAuthError, sendGmailMessage, type GmailSendResult } from "@/lib/google/gmail";
import {
  buildTemplateContext,
  renderTemplate,
  renderTemplateBodyWithUnsubscribe,
} from "@/lib/templates";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  getSendSuppressionStatus,
} from "@/lib/unsubscribe";
import {
  fetchCampaignSheetRows,
  getCampaignColumnMapping,
  getMissingRequiredColumns,
  normalizeHeader,
  updateCampaignSheetRow,
  type CampaignColumnMapping,
  type SheetDataRow,
} from "@/lib/sheets";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const TOUCH_1_SENT = "touch_1_sent";

type ActiveStep1Template = {
  bodyTemplate: string;
  id: string;
  subjectTemplate: string;
};

type AppSettingsRow = {
  global_daily_send_cap: number | null;
};

type RunStats = {
  capLimited: boolean;
  eligibleNotProcessedDueToCap: number;
  eligibleRowsFound: number;
  emailsSelectedForRun: number;
  emailsSent: number;
  emailsSkipped: number;
  errors: string[];
  rowsScanned: number;
};

type CandidateRow = {
  email: string;
  row: SheetDataRow;
  snapshot: Record<string, unknown>;
};

type SendHistoryStatus = "failed" | "sent" | "skipped";

export async function runCampaignNow(campaignId: string): Promise<void> {
  const campaign = await getCampaign(campaignId);

  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    throw new Error("Campaign must have a Google account, Sheet ID, and worksheet before running.");
  }

  const supabase = createSupabaseAdminClient();
  const startedAt = new Date();
  const runId = await createCampaignRun({
    campaignId,
    startedAt,
  });
  const stats: RunStats = {
    capLimited: false,
    eligibleNotProcessedDueToCap: 0,
    eligibleRowsFound: 0,
    emailsSelectedForRun: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    errors: [],
    rowsScanned: 0,
  };

  try {
    const [mapping, step, sheetRows, globalDailySendCap] = await Promise.all([
      getCampaignColumnMapping(campaignId),
      getActiveStep1Template(campaignId),
      fetchCampaignSheetRows({
        googleAccountId: campaign.googleAccountId,
        sheetId: campaign.sheetId,
        worksheetName: campaign.worksheetName,
      }),
      getGlobalDailySendCap(),
    ]);

    if (!step) {
      throw new Error("Active Step 1 template is required before running this campaign.");
    }

    const missingRequiredColumns = getMissingRequiredColumns(sheetRows.headers, mapping);

    if (missingRequiredColumns.length > 0) {
      throw new Error(`Sheet is missing required columns: ${missingRequiredColumns.join(", ")}`);
    }

    const candidates = getCandidateRows({
      headers: sheetRows.headers,
      mapping,
      rows: sheetRows.rows,
    });
    const capacity = await getAvailableCapacity({
      campaign,
      globalDailySendCap,
    });
    const availableCapacity = Math.max(0, capacity);
    const selectedRows = candidates.slice(0, availableCapacity);

    stats.rowsScanned = sheetRows.rows.length;
    stats.eligibleRowsFound = candidates.length;
    stats.emailsSelectedForRun = selectedRows.length;
    stats.eligibleNotProcessedDueToCap = Math.max(0, candidates.length - selectedRows.length);
    stats.capLimited = stats.eligibleNotProcessedDueToCap > 0;

    for (const candidate of selectedRows) {
      await processSelectedRow({
        campaign,
        candidate,
        headers: sheetRows.headers,
        mapping,
        stats,
        step,
      });
    }

    const status = getRunStatus(stats);
    const now = new Date().toISOString();
    await Promise.all([
      updateCampaignRun(runId, stats, status),
      supabase
        .from("campaigns")
        .update({
          last_run_at: now,
          last_successful_run_at: status === "failed" ? campaign.lastSuccessfulRunAt : now,
        })
        .eq("id", campaignId),
    ]);
  } catch (error) {
    stats.errors.push(formatError(error));
    await Promise.all([
      updateCampaignRun(runId, stats, "failed"),
      supabase.from("campaigns").update({ last_run_at: new Date().toISOString() }).eq("id", campaignId),
    ]);
  }
}

async function processSelectedRow({
  campaign,
  candidate,
  headers,
  mapping,
  stats,
  step,
}: {
  campaign: Campaign;
  candidate: CandidateRow;
  headers: string[];
  mapping: CampaignColumnMapping;
  stats: RunStats;
  step: ActiveStep1Template;
}) {
  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    throw new Error("Campaign Google Sheet configuration is missing.");
  }

  const token = generateUnsubscribeToken();
  const context = buildTemplateContext(headers, candidate.row.values);
  const subject = renderTemplate(step.subjectTemplate, context);
  const body = renderTemplateBodyWithUnsubscribe({
    bodyTemplate: step.bodyTemplate,
    context,
    unsubscribeUrl: buildUnsubscribeUrl(token),
  });
  const missingColumns = Array.from(new Set([...subject.missingColumns, ...body.missingColumns]));

  if (missingColumns.length > 0) {
    stats.emailsSkipped += 1;
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: `Template references missing columns: ${missingColumns.join(", ")}`,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: step.id,
      status: "skipped",
      subjectRendered: subject.output,
      token,
    });
    return;
  }

  const suppressionStatus = await getSendSuppressionStatus(candidate.email);

  if (suppressionStatus.suppressed) {
    stats.emailsSkipped += 1;
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: `Suppressed recipient: ${suppressionStatus.reason}`,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: step.id,
      status: "skipped",
      subjectRendered: subject.output,
      token,
    });
    return;
  }

  try {
    const gmailResult = await sendCampaignMessageWithRefresh({
      body: body.output,
      campaignGoogleAccountId: campaign.googleAccountId,
      recipientEmail: candidate.email,
      subject: subject.output,
    });

    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      gmailMessageId: gmailResult.messageId,
      gmailThreadId: gmailResult.threadId,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: step.id,
      status: "sent",
      subjectRendered: subject.output,
      token,
    });

    await updateCampaignSheetRow({
      googleAccountId: campaign.googleAccountId,
      headers,
      mapping,
      rowNumber: candidate.row.rowNumber,
      sheetId: campaign.sheetId,
      values: {
        errorMessage: "",
        lastSentAt: new Date().toISOString(),
        lastTouchSent: "1",
        stage: TOUCH_1_SENT,
        status: TOUCH_1_SENT,
      },
      worksheetName: campaign.worksheetName,
    });
    stats.emailsSent += 1;
  } catch (error) {
    const message = truncate(formatError(error), 300);
    stats.errors.push(`Row ${candidate.row.rowNumber}: ${message}`);
    await insertSendHistory({
      bodyRendered: body.output,
      campaignId: campaign.id,
      errorMessage: message,
      recipientEmail: candidate.email,
      recipientRowNumber: candidate.row.rowNumber,
      recipientSnapshot: candidate.snapshot,
      sequenceStepId: step.id,
      status: "failed",
      subjectRendered: subject.output,
      token,
    });
    await updateCampaignSheetRow({
      googleAccountId: campaign.googleAccountId,
      headers,
      mapping,
      rowNumber: candidate.row.rowNumber,
      sheetId: campaign.sheetId,
      values: {
        errorMessage: message,
        status: "error",
      },
      worksheetName: campaign.worksheetName,
    });
  }
}

function getCandidateRows({
  headers,
  mapping,
  rows,
}: {
  headers: string[];
  mapping: CampaignColumnMapping;
  rows: SheetDataRow[];
}): CandidateRow[] {
  const candidates: CandidateRow[] = [];

  for (const row of rows) {
    const email = normalizeEmail(getMappedValue(headers, row.values, mapping.emailColumn));
    const status = normalizeCell(getMappedValue(headers, row.values, mapping.statusColumn));
    const stage = normalizeCell(getMappedValue(headers, row.values, mapping.stageColumn));
    const unsubscribedAt = normalizeCell(getMappedValue(headers, row.values, mapping.unsubscribedAtColumn));
    const repliedAt = normalizeCell(getMappedValue(headers, row.values, mapping.repliedAtColumn));

    if (!email || !isEmail(email)) {
      continue;
    }

    if (unsubscribedAt || repliedAt) {
      continue;
    }

    if (!["", "new", "active"].includes(status)) {
      continue;
    }

    if (!["", "new"].includes(stage)) {
      continue;
    }

    candidates.push({
      email,
      row,
      snapshot: {
        rowNumber: row.rowNumber,
        values: Object.fromEntries(headers.map((header, index) => [header, row.values[index] ?? ""])),
      },
    });
  }

  return candidates;
}

async function sendCampaignMessageWithRefresh({
  body,
  campaignGoogleAccountId,
  recipientEmail,
  subject,
}: {
  body: string;
  campaignGoogleAccountId: string;
  recipientEmail: string;
  subject: string;
}): Promise<GmailSendResult> {
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

async function getActiveStep1Template(campaignId: string): Promise<ActiveStep1Template | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sequence_steps")
    .select("id, subject_template, body_template")
    .eq("campaign_id", campaignId)
    .eq("step_number", 1)
    .eq("is_active", true)
    .maybeSingle<{ id: string; subject_template: string; body_template: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    bodyTemplate: data.body_template,
    id: data.id,
    subjectTemplate: data.subject_template,
  };
}

async function getAvailableCapacity({
  campaign,
  globalDailySendCap,
}: {
  campaign: Campaign;
  globalDailySendCap: number;
}): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [campaignSentResult, globalSentResult] = await Promise.all([
    supabase
      .from("send_history")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("send_type", "campaign")
      .eq("status", "sent")
      .gte("sent_at", startOfToday.toISOString()),
    supabase
      .from("send_history")
      .select("id", { count: "exact", head: true })
      .eq("send_type", "campaign")
      .eq("status", "sent")
      .gte("sent_at", startOfToday.toISOString()),
  ]);

  const firstError = campaignSentResult.error ?? globalSentResult.error;

  if (firstError) {
    throw firstError;
  }

  return Math.min(
    Math.max(0, campaign.dailySendCap - (campaignSentResult.count ?? 0)),
    Math.max(0, globalDailySendCap - (globalSentResult.count ?? 0)),
  );
}

async function getGlobalDailySendCap(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("global_daily_send_cap")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<AppSettingsRow>();

  if (error) {
    throw error;
  }

  return data?.global_daily_send_cap ?? Number.parseInt(process.env.DEFAULT_GLOBAL_DAILY_SEND_CAP ?? "70", 10);
}

async function createCampaignRun({
  campaignId,
  startedAt,
}: {
  campaignId: string;
  startedAt: Date;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaign_runs")
    .insert({
      campaign_id: campaignId,
      run_type: "manual",
      started_at: startedAt.toISOString(),
      status: "failed",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
}

async function updateCampaignRun(
  runId: string,
  stats: RunStats,
  status: "failed" | "partial_success" | "success",
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("campaign_runs")
    .update({
      cap_limited: stats.capLimited,
      eligible_not_processed_due_to_cap: stats.eligibleNotProcessedDueToCap,
      eligible_rows_found: stats.eligibleRowsFound,
      emails_selected_for_run: stats.emailsSelectedForRun,
      emails_sent: stats.emailsSent,
      emails_skipped: stats.emailsSkipped,
      error_summary: buildErrorSummary(stats),
      errors_count: stats.errors.length,
      finished_at: new Date().toISOString(),
      rows_scanned: stats.rowsScanned,
      status,
    })
    .eq("id", runId);

  if (error) {
    throw error;
  }
}

async function insertSendHistory({
  bodyRendered,
  campaignId,
  errorMessage,
  gmailMessageId,
  gmailThreadId,
  recipientEmail,
  recipientRowNumber,
  recipientSnapshot,
  sequenceStepId,
  status,
  subjectRendered,
  token,
}: {
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
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("send_history").insert({
    body_rendered: bodyRendered,
    campaign_id: campaignId,
    error_message: errorMessage ?? null,
    gmail_message_id: gmailMessageId ?? null,
    gmail_thread_id: gmailThreadId ?? null,
    recipient_email: recipientEmail,
    recipient_row_number: recipientRowNumber,
    recipient_snapshot: recipientSnapshot,
    send_type: "campaign",
    sent_at: status === "sent" ? new Date().toISOString() : null,
    sequence_step_id: sequenceStepId,
    status,
    subject_rendered: subjectRendered,
    unsubscribe_token: token,
  });

  if (error) {
    throw error;
  }
}

function getRunStatus(stats: RunStats): "failed" | "partial_success" | "success" {
  if (stats.errors.length > 0 && stats.emailsSent === 0) {
    return "failed";
  }

  if (stats.errors.length > 0 || stats.emailsSkipped > 0 || stats.capLimited) {
    return "partial_success";
  }

  return "success";
}

function getMappedValue(
  headers: string[],
  row: string[],
  mappedColumn: string | null,
): string {
  if (!mappedColumn) {
    return "";
  }

  const columnIndex = headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(mappedColumn));

  return columnIndex >= 0 ? row[columnIndex] ?? "" : "";
}

function normalizeCell(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildErrorSummary(stats: RunStats): string | null {
  const parts = [
    ...stats.errors.slice(0, 5),
    stats.capLimited
      ? `${stats.eligibleNotProcessedDueToCap} eligible row(s) were not processed due to send caps.`
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : null;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown campaign run error.";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
