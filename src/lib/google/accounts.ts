import { decryptToken, encryptToken } from "@/lib/crypto/token-encryption";
import {
  fetchGoogleUserInfo,
  getGoogleOAuthEnvStatus,
  refreshAccessToken,
  type GoogleTokenResponse,
} from "@/lib/google/oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type ConnectedGoogleAccount = {
  id: string;
  email: string;
  scope: string;
  tokenExpiry: string;
  createdAt: string;
  updatedAt: string;
  refreshStatus: "current" | "refreshed" | "unavailable" | "failed";
  refreshError?: string;
};

type GoogleAccountRow = {
  id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  scope: string;
  token_expiry: string;
  created_at: string;
  updated_at: string;
};

export async function getConnectedGoogleAccount(): Promise<ConnectedGoogleAccount | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select(
      "id, email, access_token_encrypted, refresh_token_encrypted, scope, token_expiry, created_at, updated_at",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<GoogleAccountRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const refreshStatus = await refreshStoredGoogleAccountIfNeeded(data);

  return {
    id: data.id,
    email: data.email,
    scope: data.scope,
    tokenExpiry: refreshStatus.tokenExpiry ?? data.token_expiry,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    refreshStatus: refreshStatus.status,
    refreshError: refreshStatus.error,
  };
}

export async function storeGoogleAccount(tokens: GoogleTokenResponse): Promise<string> {
  const userInfo = await fetchGoogleUserInfo(tokens.accessToken);
  const supabase = createSupabaseAdminClient();
  const existing = await getGoogleAccountByEmail(userInfo.email);
  const refreshTokenEncrypted = tokens.refreshToken
    ? encryptToken(tokens.refreshToken)
    : existing?.refresh_token_encrypted;

  if (!refreshTokenEncrypted) {
    throw new Error("Google did not return a refresh token. Reconnect with consent enabled.");
  }

  const { data, error } = await supabase
    .from("google_accounts")
    .upsert(
      {
        email: userInfo.email,
        access_token_encrypted: encryptToken(tokens.accessToken),
        refresh_token_encrypted: refreshTokenEncrypted,
        scope: tokens.scope,
        token_expiry: tokens.expiresAt,
      },
      { onConflict: "email" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
}

export async function getValidGoogleAccessToken(accountId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select(
      "id, email, access_token_encrypted, refresh_token_encrypted, scope, token_expiry, created_at, updated_at",
    )
    .eq("id", accountId)
    .single<GoogleAccountRow>();

  if (error) {
    throw error;
  }

  if (!shouldRefresh(data.token_expiry)) {
    return decryptToken(data.access_token_encrypted);
  }

  const refreshed = await refreshStoredGoogleAccount(data);

  return refreshed.accessToken;
}

export async function disconnectGoogleAccount(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("google_accounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    throw error;
  }
}

async function getGoogleAccountByEmail(email: string): Promise<GoogleAccountRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_accounts")
    .select(
      "id, email, access_token_encrypted, refresh_token_encrypted, scope, token_expiry, created_at, updated_at",
    )
    .eq("email", email)
    .maybeSingle<GoogleAccountRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function refreshStoredGoogleAccountIfNeeded(
  account: GoogleAccountRow,
): Promise<{ status: ConnectedGoogleAccount["refreshStatus"]; tokenExpiry?: string; error?: string }> {
  if (!shouldRefresh(account.token_expiry)) {
    return { status: "current" };
  }

  if (!getGoogleOAuthEnvStatus().configured) {
    return { status: "unavailable", error: "Google OAuth environment is incomplete." };
  }

  try {
    const refreshed = await refreshStoredGoogleAccount(account);

    return { status: "refreshed", tokenExpiry: refreshed.expiresAt };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Google token refresh failed.",
    };
  }
}

async function refreshStoredGoogleAccount(
  account: GoogleAccountRow,
): Promise<{ accessToken: string; expiresAt: string }> {
  const refreshToken = decryptToken(account.refresh_token_encrypted);
  const refreshed = await refreshAccessToken(refreshToken);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("google_accounts")
    .update({
      access_token_encrypted: encryptToken(refreshed.accessToken),
      scope: refreshed.scope || account.scope,
      token_expiry: refreshed.expiresAt,
    })
    .eq("id", account.id);

  if (error) {
    throw error;
  }

  return {
    accessToken: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
  };
}

function shouldRefresh(tokenExpiry: string): boolean {
  return new Date(tokenExpiry).getTime() - Date.now() <= REFRESH_WINDOW_MS;
}
