"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import { getCampaign } from "@/lib/campaigns";
import {
  COLUMN_MAPPING_FIELDS,
  getCampaignColumnMapping,
  saveCampaignColumnMapping,
  validateCampaignSheet,
  type CampaignColumnMapping,
} from "@/lib/sheets";

export async function saveColumnMapping(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  await saveCampaignColumnMapping(campaignId, readMappingFromForm(campaignId, formData));
  revalidateCampaign(campaignId);
  redirect(`/campaigns/${campaignId}?sheet=mapping-saved`);
}

export async function validateSheetConfiguration(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  const mapping = await getCampaignColumnMapping(campaignId);

  if (!campaign.googleAccountId || !campaign.sheetId || !campaign.worksheetName) {
    redirect(`/campaigns/${campaignId}?sheet=missing-config`);
  }

  const result = await validateCampaignSheet({
    googleAccountId: campaign.googleAccountId,
    sheetId: campaign.sheetId,
    worksheetName: campaign.worksheetName,
    mapping,
  });

  revalidateCampaign(campaignId);

  if (result.ok) {
    redirect(`/campaigns/${campaignId}?sheet=validated`);
  }

  redirect(`/campaigns/${campaignId}?sheet=missing-columns`);
}

function readMappingFromForm(
  campaignId: string,
  formData: FormData,
): CampaignColumnMapping {
  const values = Object.fromEntries(
    COLUMN_MAPPING_FIELDS.map((field) => [
      field.key,
      readColumnValue(formData, field.key, field.required),
    ]),
  ) as Record<keyof Omit<CampaignColumnMapping, "id" | "campaignId">, string | null>;

  return {
    id: null,
    campaignId,
    ...values,
  };
}

function readColumnValue(formData: FormData, key: string, required: boolean): string | null {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    if (required) {
      throw new Error(`${key} is required.`);
    }

    return null;
  }

  return value.trim();
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
  revalidatePath(`/campaigns/${campaignId}/edit`);
  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
}
