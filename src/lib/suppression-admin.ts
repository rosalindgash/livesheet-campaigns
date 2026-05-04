import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const SUPPRESSION_REASONS = [
  "manual_suppression",
  "unsubscribed",
  "bounce",
  "complaint",
  "reply_stop",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export type SuppressionListEntry = {
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
  email: string;
  id: string;
  notes: string | null;
  reason: SuppressionReason;
  source: string;
};

export type UnsubscribeEventEntry = {
  campaignId: string | null;
  campaignName: string | null;
  id: string;
  recipientEmail: string;
  token: string;
  unsubscribedAt: string;
  userAgent: string | null;
};

export type BounceEventEntry = {
  action: "manual_review" | "suppressed";
  campaignId: string | null;
  campaignName: string | null;
  confidence: "high" | "low";
  detectedAt: string;
  id: string;
  rawSourceMessageId: string;
  reason: string | null;
  recipientEmail: string | null;
  statusCode: string | null;
};

type CampaignNameRow = {
  id: string;
  name: string;
};

type BounceEventRow = {
  action: "manual_review" | "suppressed";
  campaign_id: string | null;
  confidence: "high" | "low";
  detected_at: string;
  id: string;
  raw_source_message_id: string;
  reason: string | null;
  recipient_email: string | null;
  status_code: string | null;
};

type SuppressionListRow = {
  campaign_id: string | null;
  created_at: string;
  email: string;
  id: string;
  notes: string | null;
  reason: SuppressionReason;
  source: string;
};

type UnsubscribeEventRow = {
  campaign_id: string | null;
  id: string;
  recipient_email: string;
  token: string;
  unsubscribed_at: string;
  user_agent: string | null;
};

export async function getSuppressionAdminSnapshot(): Promise<{
  bounceEvents: BounceEventEntry[];
  campaigns: CampaignNameRow[];
  suppressions: SuppressionListEntry[];
  unsubscribeEvents: UnsubscribeEventEntry[];
}> {
  const supabase = createSupabaseAdminClient();
  const [campaignsResult, suppressionsResult, unsubscribeEventsResult, bounceEventsResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .order("name", { ascending: true })
      .returns<CampaignNameRow[]>(),
    supabase
      .from("suppression_list")
      .select("id, email, reason, campaign_id, source, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SuppressionListRow[]>(),
    supabase
      .from("unsubscribe_events")
      .select("id, campaign_id, recipient_email, token, unsubscribed_at, user_agent")
      .order("unsubscribed_at", { ascending: false })
      .limit(100)
      .returns<UnsubscribeEventRow[]>(),
    supabase
      .from("bounce_events")
      .select(
        "id, campaign_id, recipient_email, raw_source_message_id, reason, status_code, confidence, action, detected_at",
      )
      .order("detected_at", { ascending: false })
      .limit(100)
      .returns<BounceEventRow[]>(),
  ]);

  const firstError =
    campaignsResult.error ??
    suppressionsResult.error ??
    unsubscribeEventsResult.error ??
    bounceEventsResult.error;

  if (firstError) {
    throw firstError;
  }

  const campaignNames = new Map(
    (campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign.name]),
  );

  return {
    bounceEvents: (bounceEventsResult.data ?? []).map((event) => ({
      action: event.action,
      campaignId: event.campaign_id,
      campaignName: event.campaign_id ? campaignNames.get(event.campaign_id) ?? null : null,
      confidence: event.confidence,
      detectedAt: event.detected_at,
      id: event.id,
      rawSourceMessageId: event.raw_source_message_id,
      reason: event.reason,
      recipientEmail: event.recipient_email,
      statusCode: event.status_code,
    })),
    campaigns: campaignsResult.data ?? [],
    suppressions: (suppressionsResult.data ?? []).map((entry) => ({
      campaignId: entry.campaign_id,
      campaignName: entry.campaign_id ? campaignNames.get(entry.campaign_id) ?? null : null,
      createdAt: entry.created_at,
      email: entry.email,
      id: entry.id,
      notes: entry.notes,
      reason: entry.reason,
      source: entry.source,
    })),
    unsubscribeEvents: (unsubscribeEventsResult.data ?? []).map((event) => ({
      campaignId: event.campaign_id,
      campaignName: event.campaign_id ? campaignNames.get(event.campaign_id) ?? null : null,
      id: event.id,
      recipientEmail: event.recipient_email,
      token: event.token,
      unsubscribedAt: event.unsubscribed_at,
      userAgent: event.user_agent,
    })),
  };
}

export function isSuppressionReason(value: string): value is SuppressionReason {
  return SUPPRESSION_REASONS.includes(value as SuppressionReason);
}

export function normalizeSuppressionEmail(email: string): string {
  return email.trim().toLowerCase();
}
