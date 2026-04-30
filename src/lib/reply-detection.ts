import { getCampaign } from "@/lib/campaigns";
import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import {
  fetchGmailThread,
  isGmailAuthError,
  type GmailThreadMessage,
} from "@/lib/google/gmail";
import {
  fetchCampaignSheetRows,
  getCampaignColumnMapping,
  updateCampaignSheetRow,
} from "@/lib/sheets";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const MAX_SENDS_PER_CHECK = 50;

type PendingSendRow = {
  campaign_id: string;
  created_at: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  id: string;
  recipient_email: string;
  recipient_row_number: number | null;
  sent_at: string | null;
};

type ReplyEventRow = {
  id: string;
  recipient_email: string;
  reply_detected_at: string;
};

type CampaignCacheEntry = Awaited<ReturnType<typeof getCampaign>>;

type DetectedReply = {
  gmailMessageId: string;
  replyDetectedAt: string;
  replySubject: string | null;
  snippet: string | null;
};

export type ReplyDetectionResult = {
  checkedAt: string;
  dryRun: boolean;
  errors: Array<{ error: string; sendHistoryId: string }>;
  repliesDetected: Array<{
    campaignId: string;
    dryRun: boolean;
    gmailMessageId: string;
    gmailThreadId: string;
    recipientEmail: string;
    sendHistoryId: string;
    sheetWriteback: "dry-run" | "failed" | "not-configured" | "skipped" | "updated";
  }>;
  sendsChecked: number;
  sendsEligible: number;
};

export async function checkCampaignReplies({
  dryRun = false,
}: {
  dryRun?: boolean;
} = {}): Promise<ReplyDetectionResult> {
  const pendingSends = await getPendingReplyDetectionSends();
  const campaignCache = new Map<string, CampaignCacheEntry>();
  const result: ReplyDetectionResult = {
    checkedAt: new Date().toISOString(),
    dryRun,
    errors: [],
    repliesDetected: [],
    sendsChecked: 0,
    sendsEligible: pendingSends.length,
  };

  for (const send of pendingSends) {
    result.sendsChecked += 1;

    try {
      if (!send.gmail_thread_id) {
        continue;
      }

      const campaign = await getCachedCampaign(campaignCache, send.campaign_id);

      if (!campaign.googleAccountId || !campaign.googleAccountEmail) {
        continue;
      }

      const messages = await fetchThreadWithRefresh({
        googleAccountId: campaign.googleAccountId,
        threadId: send.gmail_thread_id,
      });
      const reply = findRecipientReply({
        connectedEmail: campaign.googleAccountEmail,
        messages,
        recipientEmail: send.recipient_email,
        sentAt: send.sent_at,
        sentMessageId: send.gmail_message_id,
      });

      if (!reply) {
        continue;
      }

      let sheetWriteback: ReplyDetectionResult["repliesDetected"][number]["sheetWriteback"] = dryRun
        ? "dry-run"
        : "skipped";

      if (!dryRun) {
        await recordReplyDetection({ reply, send });
        sheetWriteback = await writeReplyToSheet({ campaign, reply, send });
      }

      result.repliesDetected.push({
        campaignId: send.campaign_id,
        dryRun,
        gmailMessageId: reply.gmailMessageId,
        gmailThreadId: send.gmail_thread_id,
        recipientEmail: send.recipient_email,
        sendHistoryId: send.id,
        sheetWriteback,
      });
    } catch (error) {
      result.errors.push({
        error: error instanceof Error ? error.message : "Unknown reply detection error.",
        sendHistoryId: send.id,
      });
    }
  }

  return result;
}

export async function getCampaignReplySummary(campaignId: string): Promise<{
  latestReplyAt: string | null;
  recentReplies: Array<{
    recipientEmail: string;
    replyDetectedAt: string;
  }>;
  replyCount: number;
}> {
  const supabase = createSupabaseAdminClient();
  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    supabase
      .from("reply_events")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId),
    supabase
      .from("reply_events")
      .select("id, recipient_email, reply_detected_at")
      .eq("campaign_id", campaignId)
      .order("reply_detected_at", { ascending: false })
      .limit(5)
      .returns<ReplyEventRow[]>(),
  ]);

  const firstError = countError ?? dataError;

  if (firstError) {
    throw firstError;
  }

  return {
    latestReplyAt: data?.[0]?.reply_detected_at ?? null,
    recentReplies:
      data?.map((event) => ({
        recipientEmail: event.recipient_email,
        replyDetectedAt: event.reply_detected_at,
      })) ?? [],
    replyCount: count ?? 0,
  };
}

async function getPendingReplyDetectionSends(): Promise<PendingSendRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data: replyEvents, error: replyError } = await supabase
    .from("reply_events")
    .select("send_history_id")
    .not("send_history_id", "is", null)
    .returns<Array<{ send_history_id: string }>>();

  if (replyError) {
    throw replyError;
  }

  const repliedSendIds = new Set((replyEvents ?? []).map((event) => event.send_history_id));
  const { data, error } = await supabase
    .from("send_history")
    .select(
      "id, campaign_id, recipient_email, recipient_row_number, gmail_message_id, gmail_thread_id, sent_at, created_at",
    )
    .eq("send_type", "campaign")
    .eq("status", "sent")
    .not("gmail_thread_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(MAX_SENDS_PER_CHECK)
    .returns<PendingSendRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).filter((send) => !repliedSendIds.has(send.id));
}

async function getCachedCampaign(
  cache: Map<string, CampaignCacheEntry>,
  campaignId: string,
): Promise<CampaignCacheEntry> {
  const cached = cache.get(campaignId);

  if (cached) {
    return cached;
  }

  const campaign = await getCampaign(campaignId);

  cache.set(campaignId, campaign);

  return campaign;
}

async function fetchThreadWithRefresh({
  googleAccountId,
  threadId,
}: {
  googleAccountId: string;
  threadId: string;
}): Promise<GmailThreadMessage[]> {
  const accessToken = await getValidGoogleAccessToken(googleAccountId);

  try {
    return await fetchGmailThread({ accessToken, threadId });
  } catch (error) {
    if (!isGmailAuthError(error)) {
      throw error;
    }

    return fetchGmailThread({
      accessToken: await refreshGoogleAccessToken(googleAccountId),
      threadId,
    });
  }
}

function findRecipientReply({
  connectedEmail,
  messages,
  recipientEmail,
  sentAt,
  sentMessageId,
}: {
  connectedEmail: string;
  messages: GmailThreadMessage[];
  recipientEmail: string;
  sentAt: string | null;
  sentMessageId: string | null;
}): DetectedReply | null {
  const sentIndex = sentMessageId
    ? messages.findIndex((message) => message.id === sentMessageId)
    : -1;
  const laterMessages = sentIndex >= 0
    ? messages.slice(sentIndex + 1)
    : messages.filter((message) => isMessageAfterSentAt(message, sentAt));
  const normalizedRecipient = normalizeEmail(recipientEmail);
  const normalizedConnectedEmail = normalizeEmail(connectedEmail);

  for (const message of laterMessages) {
    const fromEmail = extractEmail(getHeader(message, "From"));
    const normalizedFrom = normalizeEmail(fromEmail);

    if (!message.id || !normalizedFrom || normalizedFrom === normalizedConnectedEmail) {
      continue;
    }

    if (isAutoReply(message)) {
      continue;
    }

    if (normalizedFrom === normalizedRecipient) {
      return {
        gmailMessageId: message.id,
        replyDetectedAt: getMessageDate(message),
        replySubject: getHeader(message, "Subject") || null,
        snippet: message.snippet ?? null,
      };
    }
  }

  return null;
}

async function recordReplyDetection({
  reply,
  send,
}: {
  reply: DetectedReply;
  send: PendingSendRow;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error: insertError } = await supabase.from("reply_events").insert({
    campaign_id: send.campaign_id,
    gmail_message_id: reply.gmailMessageId,
    gmail_thread_id: send.gmail_thread_id,
    recipient_email: normalizeEmail(send.recipient_email),
    reply_detected_at: reply.replyDetectedAt,
    reply_subject: reply.replySubject,
    send_history_id: send.id,
    snippet: reply.snippet,
  });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }

  const { error: updateError } = await supabase
    .from("send_history")
    .update({ status: "reply_detected" })
    .eq("id", send.id);

  if (updateError) {
    throw updateError;
  }
}

async function writeReplyToSheet({
  campaign,
  reply,
  send,
}: {
  campaign: CampaignCacheEntry;
  reply: DetectedReply;
  send: PendingSendRow;
}): Promise<"failed" | "not-configured" | "updated"> {
  if (
    !campaign.googleAccountId ||
    !campaign.sheetId ||
    !campaign.worksheetName ||
    !send.recipient_row_number
  ) {
    return "not-configured";
  }

  try {
    const [mapping, sheetRows] = await Promise.all([
      getCampaignColumnMapping(campaign.id),
      fetchCampaignSheetRows({
        googleAccountId: campaign.googleAccountId,
        sheetId: campaign.sheetId,
        worksheetName: campaign.worksheetName,
      }),
    ]);

    await updateCampaignSheetRow({
      googleAccountId: campaign.googleAccountId,
      headers: sheetRows.headers,
      mapping,
      rowNumber: send.recipient_row_number,
      sheetId: campaign.sheetId,
      values: {
        errorMessage: "",
        repliedAt: reply.replyDetectedAt,
        status: "replied",
      },
      worksheetName: campaign.worksheetName,
    });

    return "updated";
  } catch {
    return "failed";
  }
}

function getHeader(message: GmailThreadMessage, headerName: string): string {
  return (
    message.payload?.headers?.find(
      (header) => header.name?.toLowerCase() === headerName.toLowerCase(),
    )?.value ?? ""
  );
}

function isMessageAfterSentAt(message: GmailThreadMessage, sentAt: string | null): boolean {
  if (!sentAt || !message.internalDate) {
    return true;
  }

  return Number.parseInt(message.internalDate, 10) > new Date(sentAt).getTime();
}

function getMessageDate(message: GmailThreadMessage): string {
  if (message.internalDate) {
    return new Date(Number.parseInt(message.internalDate, 10)).toISOString();
  }

  const headerDate = Date.parse(getHeader(message, "Date"));

  return Number.isNaN(headerDate) ? new Date().toISOString() : new Date(headerDate).toISOString();
}

function isAutoReply(message: GmailThreadMessage): boolean {
  const subject = getHeader(message, "Subject").toLowerCase();
  const autoSubmitted = getHeader(message, "Auto-Submitted").toLowerCase();
  const precedence = getHeader(message, "Precedence").toLowerCase();
  const listId = getHeader(message, "List-Id");

  return (
    subject.includes("automatic reply") ||
    subject.includes("out of office") ||
    (autoSubmitted.length > 0 && autoSubmitted !== "no") ||
    precedence === "bulk" ||
    precedence === "list" ||
    listId.length > 0
  );
}

function extractEmail(value: string): string {
  const angleMatch = value.match(/<([^>]+)>/);

  if (angleMatch?.[1]) {
    return angleMatch[1];
  }

  const emailMatch = value.match(/[^\s<>"]+@[^\s<>"]+/);

  return emailMatch?.[0] ?? value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
