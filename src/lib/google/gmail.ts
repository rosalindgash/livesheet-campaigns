type GmailSendResponse = {
  id?: string;
  threadId?: string;
  error?: {
    message?: string;
  };
};

type GmailThreadResponse = {
  error?: {
    message?: string;
  };
  id?: string;
  messages?: GmailThreadMessage[];
};

type GmailMessageListResponse = {
  error?: {
    message?: string;
  };
  messages?: Array<{
    id?: string;
    threadId?: string;
  }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailMessageResponse = GmailMessage & {
  error?: {
    message?: string;
  };
};

export type GmailMessagePart = {
  body?: {
    data?: string;
  };
  filename?: string;
  headers?: Array<{
    name?: string;
    value?: string;
  }>;
  mimeType?: string;
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  snippet?: string;
  threadId?: string;
};

export type GmailThreadMessage = {
  id?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
  };
  snippet?: string;
  threadId?: string;
};

export type GmailSendResult = {
  messageId: string;
  threadId: string | null;
};

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

export async function sendGmailMessage({
  accessToken,
  htmlBody,
  subject,
  to,
}: {
  accessToken: string;
  htmlBody: string;
  subject: string;
  to: string;
}): Promise<GmailSendResult> {
  assertSafeHeaderValue(to, "Recipient email");
  assertSafeHeaderValue(subject, "Subject");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: buildRawEmail({ htmlBody, subject, to }),
    }),
  });
  const data = (await response.json()) as GmailSendResponse;

  if (!response.ok || data.error || !data.id) {
    throw new GmailApiError(data.error?.message ?? "Gmail send request failed.", response.status);
  }

  return {
    messageId: data.id,
    threadId: data.threadId ?? null,
  };
}

export function isGmailAuthError(error: unknown): error is GmailApiError {
  return error instanceof GmailApiError && (error.status === 401 || error.status === 403);
}

export async function listGmailMessages({
  accessToken,
  maxResults = 25,
  pageToken,
  query,
}: {
  accessToken: string;
  maxResults?: number;
  pageToken?: string;
  query: string;
}): Promise<{
  messages: Array<{ id: string; threadId: string | null }>;
  nextPageToken: string | null;
}> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");

  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));

  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as GmailMessageListResponse;

  if (!response.ok || data.error) {
    throw new GmailApiError(data.error?.message ?? "Gmail message search request failed.", response.status);
  }

  return {
    messages:
      data.messages
        ?.filter((message): message is { id: string; threadId?: string } => Boolean(message.id))
        .map((message) => ({ id: message.id, threadId: message.threadId ?? null })) ?? [],
    nextPageToken: data.nextPageToken ?? null,
  };
}

export async function fetchGmailMessage({
  accessToken,
  messageId,
}: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessage> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);

  url.searchParams.set("format", "full");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as GmailMessageResponse;

  if (!response.ok || data.error) {
    throw new GmailApiError(data.error?.message ?? "Gmail message request failed.", response.status);
  }

  return data;
}

export async function fetchGmailThread({
  accessToken,
  threadId,
}: {
  accessToken: string;
  threadId: string;
}): Promise<GmailThreadMessage[]> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`);

  url.searchParams.set("format", "metadata");
  for (const header of [
    "From",
    "Subject",
    "Date",
    "Auto-Submitted",
    "Precedence",
    "List-Id",
    "X-Auto-Response-Suppress",
  ]) {
    url.searchParams.append("metadataHeaders", header);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as GmailThreadResponse;

  if (!response.ok || data.error) {
    throw new GmailApiError(data.error?.message ?? "Gmail thread request failed.", response.status);
  }

  return data.messages ?? [];
}

function buildRawEmail({
  htmlBody,
  subject,
  to,
}: {
  htmlBody: string;
  subject: string;
  to: string;
}): string {
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(htmlBody, "utf8").toString("base64")),
  ].join("\r\n");

  return Buffer.from(mime, "utf8").toString("base64url");
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function assertSafeHeaderValue(value: string, label: string) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} cannot contain line breaks.`);
  }
}
