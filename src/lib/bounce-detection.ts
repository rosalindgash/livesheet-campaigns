import { getCampaign } from "@/lib/campaigns";
import { getValidGoogleAccessToken, refreshGoogleAccessToken } from "@/lib/google/accounts";
import {
  fetchGmailMessage,
  isGmailAuthError,
  listGmailMessages,
  type GmailMessage,
  type GmailMessagePart,
} from "@/lib/google/gmail";
import {
  fetchCampaignSheetRows,
  getCampaignColumnMapping,
  updateCampaignSheetRow,
} from "@/lib/sheets";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_BOUNCE_QUERY =
  'in:anywhere newer_than:30d -in:trash ("Mail Delivery Subsystem" OR mailer-daemon OR postmaster OR subject:"Delivery Status Notification" OR subject:"Undelivered Mail Returned" OR subject:"Mail delivery failed" OR subject:"failure notice")';
const DEFAULT_MAX_MESSAGES_PER_ACCOUNT = 25;

type BounceAction = "manual_review" | "suppressed";
type BounceConfidence = "high" | "low";

type GoogleAccountRow = {
  email: string;
  id: string;
};

type MatchingSendRow = {
  campaign_id: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  id: string;
  recipient_email: string;
  recipient_row_number: number | null;
  sent_at: string | null;
  status: string;
};

type ParsedBounce = {
  diagnosticCode: string | null;
  likelyBounce: boolean;
  originalMessageId: string | null;
  reason: string | null;
  recipientCandidates: string[];
  sender: string;
  statusCode: string | null;
  subject: string;
};

type ResolvedBounce = {
  matchedCandidateCount: number;
  recipientEmail: string | null;
  send: MatchingSendRow | null;
};

export type BounceProcessingResult = {
  accountsChecked: number;
  bouncesDetected: Array<{
    action: BounceAction;
    campaignId: string | null;
    confidence: BounceConfidence;
    dryRun: boolean;
    recipientEmail: string | null;
    rawSourceMessageId: string;
    reason: string | null;
    sendHistoryId: string | null;
    statusCode: string | null;
  }>;
  checkedAt: string;
  dryRun: boolean;
  duplicatesSkipped: number;
  errors: Array<{ error: string; rawSourceMessageId?: string }>;
  gmailMessagesChecked: number;
};

export async function processGmailBounces({
  dryRun = false,
  maxMessagesPerAccount = DEFAULT_MAX_MESSAGES_PER_ACCOUNT,
  query = DEFAULT_BOUNCE_QUERY,
}: {
  dryRun?: boolean;
  maxMessagesPerAccount?: number;
  query?: string;
} = {}): Promise<BounceProcessingResult> {
  const accounts = await getGoogleAccounts();
  const result: BounceProcessingResult = {
    accountsChecked: accounts.length,
    bouncesDetected: [],
    checkedAt: new Date().toISOString(),
    dryRun,
    duplicatesSkipped: 0,
    errors: [],
    gmailMessagesChecked: 0,
  };

  for (const account of accounts) {
    try {
      const messages = await listBounceMessagesWithRefresh({
        googleAccountId: account.id,
        maxResults: maxMessagesPerAccount,
        query,
      });

      for (const messageSummary of messages) {
        result.gmailMessagesChecked += 1;

        if (await hasProcessedBounceMessage(messageSummary.id)) {
          result.duplicatesSkipped += 1;
          continue;
        }

        try {
          const message = await fetchBounceMessageWithRefresh({
            googleAccountId: account.id,
            messageId: messageSummary.id,
          });
          const parsed = parseBounceMessage({ connectedEmail: account.email, message });

          if (!parsed.likelyBounce) {
            continue;
          }

          const resolved = await resolveBounceRecipient(parsed.recipientCandidates);
          const confidence = getBounceConfidence(parsed, resolved);
          const action: BounceAction = confidence === "high" ? "suppressed" : "manual_review";

          if (!dryRun && action === "suppressed" && resolved.send && resolved.recipientEmail) {
            const sheetWriteback = await suppressBouncedRecipient({
              parsed,
              rawSourceMessageId: messageSummary.id,
              recipientEmail: resolved.recipientEmail,
              send: resolved.send,
            });

            await recordBounceEvent({
              action,
              confidence,
              gmailThreadId: message.threadId ?? messageSummary.threadId,
              metadata: {
                matchedCandidateCount: resolved.matchedCandidateCount,
                originalMessageId: parsed.originalMessageId,
                recipientRowNumber: resolved.send.recipient_row_number,
                sendGmailMessageId: resolved.send.gmail_message_id,
                sendGmailThreadId: resolved.send.gmail_thread_id,
                sheetWriteback,
              },
              parsed,
              rawSourceMessageId: messageSummary.id,
              recipientEmail: resolved.recipientEmail,
              send: resolved.send,
            });
          } else if (!dryRun) {
            await recordBounceEvent({
              action,
              confidence,
              gmailThreadId: message.threadId ?? messageSummary.threadId,
              metadata: {
                matchedCandidateCount: resolved.matchedCandidateCount,
                originalMessageId: parsed.originalMessageId,
                recipientCandidates: parsed.recipientCandidates,
                recipientRowNumber: resolved.send?.recipient_row_number ?? null,
                sendGmailMessageId: resolved.send?.gmail_message_id ?? null,
                sendGmailThreadId: resolved.send?.gmail_thread_id ?? null,
              },
              parsed,
              rawSourceMessageId: messageSummary.id,
              recipientEmail: resolved.recipientEmail,
              send: resolved.send,
            });
          }

          result.bouncesDetected.push({
            action,
            campaignId: resolved.send?.campaign_id ?? null,
            confidence,
            dryRun,
            recipientEmail: resolved.recipientEmail,
            rawSourceMessageId: messageSummary.id,
            reason: parsed.reason,
            sendHistoryId: resolved.send?.id ?? null,
            statusCode: parsed.statusCode,
          });
        } catch (error) {
          result.errors.push({
            error: error instanceof Error ? error.message : "Unknown bounce processing error.",
            rawSourceMessageId: messageSummary.id,
          });
        }
      }
    } catch (error) {
      result.errors.push({
        error: error instanceof Error ? error.message : `Unable to process ${account.email}.`,
      });
    }
  }

  return result;
}

async function getGoogleAccounts(): Promise<GoogleAccountRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select("id, email")
    .order("email", { ascending: true })
    .returns<GoogleAccountRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function listBounceMessagesWithRefresh({
  googleAccountId,
  maxResults,
  query,
}: {
  googleAccountId: string;
  maxResults: number;
  query: string;
}) {
  const accessToken = await getValidGoogleAccessToken(googleAccountId);

  try {
    return (await listGmailMessages({ accessToken, maxResults, query })).messages;
  } catch (error) {
    if (!isGmailAuthError(error)) {
      throw error;
    }

    return (
      await listGmailMessages({
        accessToken: await refreshGoogleAccessToken(googleAccountId),
        maxResults,
        query,
      })
    ).messages;
  }
}

async function fetchBounceMessageWithRefresh({
  googleAccountId,
  messageId,
}: {
  googleAccountId: string;
  messageId: string;
}): Promise<GmailMessage> {
  const accessToken = await getValidGoogleAccessToken(googleAccountId);

  try {
    return await fetchGmailMessage({ accessToken, messageId });
  } catch (error) {
    if (!isGmailAuthError(error)) {
      throw error;
    }

    return fetchGmailMessage({
      accessToken: await refreshGoogleAccessToken(googleAccountId),
      messageId,
    });
  }
}

async function hasProcessedBounceMessage(rawSourceMessageId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bounce_events")
    .select("id")
    .eq("raw_source_message_id", rawSourceMessageId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function resolveBounceRecipient(recipientCandidates: string[]): Promise<ResolvedBounce> {
  const matches = await Promise.all(
    recipientCandidates.map(async (recipientEmail) => ({
      recipientEmail,
      send: await findMatchingSend(recipientEmail),
    })),
  );
  const matched = matches.filter(
    (match): match is { recipientEmail: string; send: MatchingSendRow } => Boolean(match.send),
  );

  if (matched.length === 1) {
    return {
      matchedCandidateCount: 1,
      recipientEmail: matched[0].recipientEmail,
      send: matched[0].send,
    };
  }

  return {
    matchedCandidateCount: matched.length,
    recipientEmail: recipientCandidates.length === 1 ? recipientCandidates[0] : null,
    send: null,
  };
}

async function findMatchingSend(recipientEmail: string): Promise<MatchingSendRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("send_history")
    .select(
      "id, campaign_id, recipient_email, recipient_row_number, gmail_message_id, gmail_thread_id, sent_at, status",
    )
    .ilike("recipient_email", recipientEmail)
    .in("status", ["sent", "reply_detected"])
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<MatchingSendRow>();

  if (error) {
    throw error;
  }

  return data;
}

function getBounceConfidence(parsed: ParsedBounce, resolved: ResolvedBounce): BounceConfidence {
  if (
    parsed.likelyBounce &&
    parsed.statusCode &&
    isPermanentFailure(parsed) &&
    resolved.send &&
    resolved.recipientEmail &&
    resolved.matchedCandidateCount === 1
  ) {
    return "high";
  }

  return "low";
}

async function suppressBouncedRecipient({
  parsed,
  rawSourceMessageId,
  recipientEmail,
  send,
}: {
  parsed: ParsedBounce;
  rawSourceMessageId: string;
  recipientEmail: string;
  send: MatchingSendRow;
}): Promise<"failed" | "not-configured" | "updated"> {
  const supabase = createSupabaseAdminClient();
  const reason = truncate(parsed.reason ?? "Gmail delivery failure detected.", 300);
  const [suppressionResult, sendHistoryResult] = await Promise.all([
    supabase.from("suppression_list").upsert(
      {
        campaign_id: send.campaign_id,
        email: normalizeEmail(recipientEmail),
        notes: `${reason} Gmail bounce message: ${rawSourceMessageId}`,
        reason: "bounce",
        source: "gmail_bounce",
      },
      { onConflict: "email" },
    ),
    supabase
      .from("send_history")
      .update({
        error_message: reason,
        status: "bounced",
      })
      .eq("id", send.id),
  ]);
  const firstError = suppressionResult.error ?? sendHistoryResult.error;

  if (firstError) {
    throw firstError;
  }

  return writeBounceToSheet({
    reason,
    send,
  });
}

async function writeBounceToSheet({
  reason,
  send,
}: {
  reason: string;
  send: MatchingSendRow;
}): Promise<"failed" | "not-configured" | "updated"> {
  if (!send.recipient_row_number) {
    return "not-configured";
  }

  try {
    const campaign = await getCampaign(send.campaign_id);

    if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
      return "not-configured";
    }

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
        errorMessage: reason,
        status: "bounced",
      },
      worksheetName: campaign.worksheetName,
    });

    return "updated";
  } catch {
    return "failed";
  }
}

async function recordBounceEvent({
  action,
  confidence,
  gmailThreadId,
  metadata,
  parsed,
  rawSourceMessageId,
  recipientEmail,
  send,
}: {
  action: BounceAction;
  confidence: BounceConfidence;
  gmailThreadId: string | null | undefined;
  metadata: Record<string, unknown>;
  parsed: ParsedBounce;
  rawSourceMessageId: string;
  recipientEmail: string | null;
  send: MatchingSendRow | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("bounce_events").insert({
    action,
    campaign_id: send?.campaign_id ?? null,
    confidence,
    diagnostic_code: parsed.diagnosticCode,
    gmail_thread_id: gmailThreadId ?? null,
    metadata,
    raw_source_message_id: rawSourceMessageId,
    reason: parsed.reason,
    recipient_email: recipientEmail,
    send_history_id: send?.id ?? null,
    sender: parsed.sender,
    status_code: parsed.statusCode,
    subject: parsed.subject,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

function parseBounceMessage({
  connectedEmail,
  message,
}: {
  connectedEmail: string;
  message: GmailMessage;
}): ParsedBounce {
  const headers = message.payload?.headers ?? [];
  const sender = getHeader(headers, "From");
  const subject = getHeader(headers, "Subject");
  const xFailedRecipients = getHeader(headers, "X-Failed-Recipients");
  const bodyText = extractMessageText(message.payload);
  const sourceText = [xFailedRecipients, message.snippet ?? "", bodyText].filter(Boolean).join("\n");
  const normalizedText = unfoldHeaderLines(sourceText);
  const diagnosticCode = extractHeaderLike(normalizedText, "Diagnostic-Code");
  const statusCode = extractStatusCode(normalizedText);
  const reason = truncate(
    diagnosticCode ?? extractReason(normalizedText) ?? message.snippet ?? "Gmail delivery failure detected.",
    1000,
  );

  return {
    diagnosticCode,
    likelyBounce: isLikelyBounce({ sender, subject, text: normalizedText }),
    originalMessageId: extractHeaderLike(normalizedText, "Message-ID"),
    reason,
    recipientCandidates: extractRecipientCandidates({
      connectedEmail,
      text: `X-Failed-Recipients: ${xFailedRecipients}\n${normalizedText}`,
    }),
    sender,
    statusCode,
    subject,
  };
}

function isLikelyBounce({
  sender,
  subject,
  text,
}: {
  sender: string;
  subject: string;
  text: string;
}): boolean {
  const haystack = `${sender}\n${subject}\n${text.slice(0, 2000)}`.toLowerCase();

  return (
    haystack.includes("mail delivery subsystem") ||
    haystack.includes("mailer-daemon") ||
    haystack.includes("postmaster") ||
    haystack.includes("delivery status notification") ||
    haystack.includes("delivery failure") ||
    haystack.includes("undelivered mail returned") ||
    haystack.includes("mail delivery failed") ||
    haystack.includes("failed permanently")
  );
}

function extractRecipientCandidates({
  connectedEmail,
  text,
}: {
  connectedEmail: string;
  text: string;
}): string[] {
  const candidates = [
    ...extractFieldEmails(text, "Final-Recipient"),
    ...extractFieldEmails(text, "Original-Recipient"),
    ...extractFieldEmails(text, "X-Failed-Recipients"),
    ...extractPhraseEmails(text),
  ];
  const connected = normalizeEmail(connectedEmail);

  return Array.from(new Set(candidates.map(normalizeEmail))).filter(
    (email) => isEmail(email) && email !== connected && !email.includes("mailer-daemon"),
  );
}

function extractFieldEmails(text: string, fieldName: string): string[] {
  const emails: string[] = [];
  const regex = new RegExp(`(?:^|\\n)${escapeRegExp(fieldName)}:\\s*([^\\n]+)`, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    emails.push(...extractEmails(match[1]));
  }

  return emails;
}

function extractPhraseEmails(text: string): string[] {
  const phrases = [
    /delivery to the following recipient failed(?: permanently)?:\s*([^\s<>"]+@[^\s<>"]+)/gi,
    /your message (?:wasn't|was not) delivered to\s+([^\s<>"]+@[^\s<>"]+)/gi,
    /couldn't be delivered to\s+([^\s<>"]+@[^\s<>"]+)/gi,
    /failed recipient:\s*([^\s<>"]+@[^\s<>"]+)/gi,
  ];
  const emails: string[] = [];

  for (const phrase of phrases) {
    let match: RegExpExecArray | null;

    while ((match = phrase.exec(text))) {
      emails.push(match[1]);
    }
  }

  if (emails.length > 0) {
    return emails;
  }

  return extractEmails(text).slice(0, 5);
}

function extractStatusCode(text: string): string | null {
  const statusField = extractHeaderLike(text, "Status")?.match(/\b[245]\.\d{1,3}\.\d{1,3}\b/);

  if (statusField?.[0]) {
    return statusField[0];
  }

  const enhancedStatus = text.match(/\b[245]\.\d{1,3}\.\d{1,3}\b/);

  if (enhancedStatus?.[0]) {
    return enhancedStatus[0];
  }

  const smtpStatus = text.match(/\b[45]\d{2}\b/);

  return smtpStatus?.[0] ?? null;
}

function extractReason(text: string): string | null {
  const diagnostic = extractHeaderLike(text, "Diagnostic-Code");

  if (diagnostic) {
    return diagnostic;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const likelyReason = lines.find((line) =>
    /(?:failed permanently|user unknown|no such user|address not found|recipient address rejected|mailbox unavailable|does not exist|message rejected)/i.test(
      line,
    ),
  );

  return likelyReason ?? null;
}

function isPermanentFailure(parsed: ParsedBounce): boolean {
  const statusCode = parsed.statusCode ?? "";
  const text = `${parsed.reason ?? ""} ${parsed.subject}`.toLowerCase();

  return (
    statusCode.startsWith("5.") ||
    /^5\d\d$/.test(statusCode) ||
    text.includes("permanent") ||
    text.includes("user unknown") ||
    text.includes("no such user") ||
    text.includes("address not found") ||
    text.includes("does not exist") ||
    text.includes("recipient address rejected") ||
    text.includes("mailbox unavailable")
  );
}

function extractMessageText(part: GmailMessagePart | undefined): string {
  if (!part) {
    return "";
  }

  const ownText = shouldDecodePart(part.mimeType)
    ? decodeGmailBody(part.body?.data ?? "", part.mimeType ?? "")
    : "";
  const childText = part.parts?.map(extractMessageText).filter(Boolean).join("\n") ?? "";

  return [ownText, childText].filter(Boolean).join("\n");
}

function shouldDecodePart(mimeType: string | undefined): boolean {
  return (
    !mimeType ||
    mimeType.startsWith("text/") ||
    mimeType === "message/delivery-status" ||
    mimeType === "message/rfc822"
  );
}

function decodeGmailBody(data: string, mimeType: string): string {
  if (!data) {
    return "";
  }

  const decoded = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

  return mimeType === "text/html" ? decoded.replace(/<[^>]+>/g, " ") : decoded;
}

function getHeader(headers: Array<{ name?: string; value?: string }>, headerName: string): string {
  return (
    headers.find((header) => header.name?.toLowerCase() === headerName.toLowerCase())?.value ?? ""
  );
}

function extractHeaderLike(text: string, headerName: string): string | null {
  const regex = new RegExp(`(?:^|\\n)${escapeRegExp(headerName)}:\\s*([^\\n]+(?:\\n[\\t ][^\\n]+)*)`, "i");
  const match = text.match(regex);
  const value = match?.[1]?.replace(/\n[\t ]+/g, " ").trim();

  return value || null;
}

function unfoldHeaderLines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[\t ]+/g, " ");
}

function extractEmails(value: string): string[] {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
}

function normalizeEmail(value: string): string {
  return value.trim().replace(/[<>;,.'")\]]+$/g, "").toLowerCase();
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
