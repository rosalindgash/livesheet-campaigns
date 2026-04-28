import { notFound } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "error"] as const;
export const SEND_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type SendDay = (typeof SEND_DAYS)[number];

export type Campaign = {
  id: string;
  name: string;
  description: string;
  googleAccountId: string | null;
  googleAccountEmail: string | null;
  sheetUrl: string | null;
  sheetId: string | null;
  worksheetName: string | null;
  status: CampaignStatus;
  dailySendCap: number;
  timezone: string;
  sendTime: string;
  sendDays: SendDay[];
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoogleAccountOption = {
  id: string;
  email: string;
};

export type CampaignFormOptions = {
  googleAccounts: GoogleAccountOption[];
  defaultTimezone: string;
};

type CampaignRow = {
  id: string;
  name: string;
  description: string;
  google_account_id: string | null;
  sheet_url: string | null;
  sheet_id: string | null;
  worksheet_name: string | null;
  status: CampaignStatus;
  daily_send_cap: number;
  timezone: string;
  send_time: string;
  send_days: unknown;
  last_run_at: string | null;
  last_successful_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type GoogleAccountRow = {
  id: string;
  email: string;
};

type AppSettingsRow = {
  timezone: string | null;
};

export async function listCampaigns(): Promise<Campaign[]> {
  const supabase = createSupabaseAdminClient();
  const [{ data: rows, error }, googleAccounts] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, description, google_account_id, sheet_url, sheet_id, worksheet_name, status, daily_send_cap, timezone, send_time, send_days, last_run_at, last_successful_run_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .returns<CampaignRow[]>(),
    listGoogleAccountOptions(),
  ]);

  if (error) {
    throw error;
  }

  return (rows ?? []).map((row) => mapCampaignRow(row, googleAccounts));
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
  const supabase = createSupabaseAdminClient();
  const [{ data, error }, googleAccounts] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, description, google_account_id, sheet_url, sheet_id, worksheet_name, status, daily_send_cap, timezone, send_time, send_days, last_run_at, last_successful_run_at, created_at, updated_at",
      )
      .eq("id", campaignId)
      .maybeSingle<CampaignRow>(),
    listGoogleAccountOptions(),
  ]);

  if (error) {
    throw error;
  }

  if (!data) {
    notFound();
  }

  return mapCampaignRow(data, googleAccounts);
}

export async function getCampaignFormOptions(): Promise<CampaignFormOptions> {
  const supabase = createSupabaseAdminClient();
  const [googleAccounts, settingsResult] = await Promise.all([
    listGoogleAccountOptions(),
    supabase
      .from("app_settings")
      .select("timezone")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<AppSettingsRow>(),
  ]);

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  return {
    googleAccounts,
    defaultTimezone:
      settingsResult.data?.timezone ?? process.env.DEFAULT_TIMEZONE ?? "America/Chicago",
  };
}

export async function listGoogleAccountOptions(): Promise<GoogleAccountOption[]> {
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

export function parseSheetId(sheetUrl: string): string | null {
  const trimmed = sheetUrl.trim();

  if (!trimmed) {
    return null;
  }

  const sheetsMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

  if (sheetsMatch?.[1]) {
    return sheetsMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function isCampaignStatus(value: string): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus);
}

export function isSendDay(value: string): value is SendDay {
  return SEND_DAYS.includes(value as SendDay);
}

function mapCampaignRow(row: CampaignRow, googleAccounts: GoogleAccountOption[]): Campaign {
  const googleAccount = googleAccounts.find((account) => account.id === row.google_account_id);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    googleAccountId: row.google_account_id,
    googleAccountEmail: googleAccount?.email ?? null,
    sheetUrl: row.sheet_url,
    sheetId: row.sheet_id,
    worksheetName: row.worksheet_name,
    status: row.status,
    dailySendCap: row.daily_send_cap,
    timezone: row.timezone,
    sendTime: formatSendTime(row.send_time),
    sendDays: parseSendDays(row.send_days),
    lastRunAt: row.last_run_at,
    lastSuccessfulRunAt: row.last_successful_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseSendDays(value: unknown): SendDay[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((day): day is SendDay => typeof day === "string" && isSendDay(day));
}

function formatSendTime(value: string): string {
  return value.slice(0, 5);
}
