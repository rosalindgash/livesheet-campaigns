"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import {
  CAMPAIGN_STATUSES,
  SEND_DAYS,
  isCampaignStatus,
  isSendDay,
  parseSheetId,
  type CampaignStatus,
  type SendDay,
} from "@/lib/campaigns";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type CampaignPayload = {
  name: string;
  description: string;
  google_account_id: string | null;
  sheet_url: string;
  sheet_id: string | null;
  worksheet_name: string;
  status: CampaignStatus;
  daily_send_cap: number;
  timezone: string;
  send_time: string;
  send_days: SendDay[];
};

export async function createCampaign(formData: FormData) {
  await requireOwnerSession();

  const payload = parseCampaignPayload(formData);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  revalidateCampaignPaths();
  redirect(`/campaigns/${data.id}`);
}

export async function updateCampaign(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const payload = parseCampaignPayload(formData);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("campaigns").update(payload).eq("id", campaignId);

  if (error) {
    throw error;
  }

  revalidateCampaignPaths(campaignId);
  redirect(`/campaigns/${campaignId}`);
}

export async function pauseCampaign(formData: FormData) {
  await setCampaignStatus(formData, "paused");
}

export async function resumeCampaign(formData: FormData) {
  await setCampaignStatus(formData, "active");
}

export async function deleteCampaign(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);

  if (error) {
    throw error;
  }

  revalidateCampaignPaths(campaignId);
  redirect("/campaigns");
}

async function setCampaignStatus(formData: FormData, status: CampaignStatus) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("campaigns").update({ status }).eq("id", campaignId);

  if (error) {
    throw error;
  }

  revalidateCampaignPaths(campaignId);
}

function parseCampaignPayload(formData: FormData): CampaignPayload {
  const sheetUrl = readRequiredString(formData, "sheetUrl");
  const dailySendCap = Number.parseInt(readRequiredString(formData, "dailySendCap"), 10);
  const status = readRequiredString(formData, "status");
  const sendTime = readRequiredString(formData, "sendTime");
  const sendDays = formData.getAll("sendDays").filter((value): value is string => typeof value === "string");

  if (!Number.isSafeInteger(dailySendCap) || dailySendCap < 1) {
    throw new Error("Daily campaign send cap must be a positive integer.");
  }

  if (!isCampaignStatus(status)) {
    throw new Error(`Campaign status must be one of: ${CAMPAIGN_STATUSES.join(", ")}.`);
  }

  if (!/^\d{2}:\d{2}$/.test(sendTime)) {
    throw new Error("Send time must use HH:MM format.");
  }

  if (sendDays.length === 0 || !sendDays.every(isSendDay)) {
    throw new Error(`Select at least one send day: ${SEND_DAYS.join(", ")}.`);
  }

  return {
    name: readRequiredString(formData, "name"),
    description: readOptionalString(formData, "description") ?? "",
    google_account_id: readOptionalString(formData, "googleAccountId"),
    sheet_url: sheetUrl,
    sheet_id: parseSheetId(sheetUrl),
    worksheet_name: readRequiredString(formData, "worksheetName"),
    status,
    daily_send_cap: dailySendCap,
    timezone: readRequiredString(formData, "timezone"),
    send_time: sendTime,
    send_days: sendDays,
  };
}

function readRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function revalidateCampaignPaths(campaignId?: string) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/campaigns");

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/edit`);
  }
}
