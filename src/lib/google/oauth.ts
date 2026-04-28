import { getRequiredEnvStatus, requireEnv } from "@/lib/env";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresAt: string;
};

export type GoogleUserInfo = {
  email: string;
  verifiedEmail: boolean;
};

type RawTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type RawUserInfoResponse = {
  email?: string;
  verified_email?: boolean;
  error?: string;
};

export function getGoogleOAuthEnvStatus() {
  return getRequiredEnvStatus([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ]);
}

export function buildGoogleAuthUrl(state: string): string {
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  return parseTokenResponse(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }),
  );
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  return parseTokenResponse(
    await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }),
  );
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as RawUserInfoResponse;

  if (!response.ok || data.error || !data.email) {
    throw new Error("Unable to identify the connected Google account.");
  }

  return {
    email: data.email,
    verifiedEmail: data.verified_email === true,
  };
}

async function parseTokenResponse(response: Response): Promise<GoogleTokenResponse> {
  const data = (await response.json()) as RawTokenResponse;

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Google token request failed.");
  }

  const expiresInSeconds =
    typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
      ? data.expires_in
      : 3600;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope ?? GOOGLE_OAUTH_SCOPES.join(" "),
    expiresAt,
  };
}
