import { randomBytes } from "crypto";

import { requireEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { renderTemplateBodyWithUnsubscribe, type TemplateContext } from "@/lib/templates";

export type SendSuppressionStatus =
  | {
      suppressed: false;
    }
  | {
      reason: string;
      skippedStatus: "skipped";
      suppressed: true;
    };

export type UnsubscribeSendRecord = {
  campaignId: string | null;
  id: string;
  recipientEmail: string;
  status: string;
  token: string;
};

type SendHistoryUnsubscribeRow = {
  campaign_id: string | null;
  id: string;
  recipient_email: string;
  status: string;
  unsubscribe_token: string;
};

type SuppressionRow = {
  reason: string;
};

export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildUnsubscribeUrl(token: string): string {
  return new URL(`/unsubscribe/${token}`, requireEnv("NEXT_PUBLIC_APP_URL")).toString();
}

export function renderBodyWithUnsubscribe({
  bodyTemplate,
  context,
  unsubscribeUrl,
}: {
  bodyTemplate: string;
  context: TemplateContext;
  unsubscribeUrl: string;
}) {
  return renderTemplateBodyWithUnsubscribe({ bodyTemplate, context, unsubscribeUrl });
}

export async function getUnsubscribeSendRecord(
  token: string,
): Promise<UnsubscribeSendRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("send_history")
    .select("id, campaign_id, recipient_email, status, unsubscribe_token")
    .eq("unsubscribe_token", token)
    .maybeSingle<SendHistoryUnsubscribeRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    campaignId: data.campaign_id,
    id: data.id,
    recipientEmail: data.recipient_email,
    status: data.status,
    token: data.unsubscribe_token,
  };
}

export async function confirmUnsubscribe({
  ipAddress,
  token,
  userAgent,
}: {
  ipAddress?: string | null;
  token: string;
  userAgent?: string | null;
}): Promise<UnsubscribeSendRecord | null> {
  const sendRecord = await getUnsubscribeSendRecord(token);

  if (!sendRecord) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const normalizedEmail = normalizeEmail(sendRecord.recipientEmail);

  const [unsubscribeResult, suppressionResult, sendHistoryResult] = await Promise.all([
    supabase.from("unsubscribe_events").upsert(
      {
        campaign_id: sendRecord.campaignId,
        ip_address: ipAddress || null,
        recipient_email: normalizedEmail,
        token,
        user_agent: userAgent || null,
      },
      { onConflict: "token" },
    ),
    supabase.from("suppression_list").upsert(
      {
        campaign_id: sendRecord.campaignId,
        email: normalizedEmail,
        reason: "unsubscribed",
        source: "unsubscribe_link",
      },
      { onConflict: "email" },
    ),
    supabase
      .from("send_history")
      .update({ status: "unsubscribed" })
      .eq("id", sendRecord.id),
  ]);

  const firstError =
    unsubscribeResult.error ?? suppressionResult.error ?? sendHistoryResult.error;

  if (firstError) {
    throw firstError;
  }

  return sendRecord;
}

export async function getSendSuppressionStatus(
  recipientEmail: string,
): Promise<SendSuppressionStatus> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("suppression_list")
    .select("reason")
    .eq("email", normalizeEmail(recipientEmail))
    .maybeSingle<SuppressionRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      suppressed: false,
    };
  }

  return {
    reason: data.reason,
    skippedStatus: "skipped",
    suppressed: true,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
