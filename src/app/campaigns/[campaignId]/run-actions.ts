"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import { runCampaignNow } from "@/lib/campaign-runner";

export async function runCampaignNowAction(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const confirmed = formData.get("confirmRealCampaignRun") === "on";

  if (!confirmed) {
    redirect(`/campaigns/${campaignId}?run=confirmation-required`);
  }

  const result = await runManualCampaign(campaignId);

  if (!result.started && result.skippedReason === "outside-send-day") {
    revalidateCampaign(campaignId);
    redirect(`/campaigns/${campaignId}?run=outside-send-day`);
  }

  revalidateCampaign(campaignId);
  redirect(`/campaigns/${campaignId}?run=completed`);
}

async function runManualCampaign(campaignId: string) {
  try {
    return await runCampaignNow(campaignId);
  } catch {
    revalidateCampaign(campaignId);
    redirect(`/campaigns/${campaignId}?run=failed`);
  }
}

function readRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function revalidateCampaign(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
}
