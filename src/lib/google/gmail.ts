type GmailSendResponse = {
  id?: string;
  threadId?: string;
  error?: {
    message?: string;
  };
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
