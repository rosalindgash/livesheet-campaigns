"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import { sanitizeBasicEmailHtml } from "@/lib/html-sanitizer";
import { isSequenceStepNumber } from "@/lib/sequence-steps";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function saveSequenceTemplate(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const stepNumber = readStepNumber(formData);
  const delayDaysAfterPreviousStep = Number.parseInt(
    readRequiredString(formData, "delayDaysAfterPreviousStep"),
    10,
  );

  if (!Number.isSafeInteger(delayDaysAfterPreviousStep) || delayDaysAfterPreviousStep < 0) {
    throw new Error("Delay days must be a non-negative integer.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("sequence_steps").upsert(
    {
      campaign_id: campaignId,
      step_number: stepNumber,
      name: readRequiredString(formData, "name"),
      subject_template: readRequiredString(formData, "subjectTemplate"),
      body_template: sanitizeBasicEmailHtml(readRequiredString(formData, "bodyTemplate")),
      delay_days_after_previous_step: delayDaysAfterPreviousStep,
      stage_required: readRequiredString(formData, "stageRequired"),
      stage_after_send: readRequiredString(formData, "stageAfterSend"),
      is_active: formData.get("isActive") === "on",
    },
    { onConflict: "campaign_id,step_number" },
  );

  if (error) {
    throw error;
  }

  revalidateCampaign(campaignId);
  redirect(`/campaigns/${campaignId}?sequence=saved`);
}

export async function deleteSequenceTemplate(formData: FormData) {
  await requireOwnerSession();

  const campaignId = readRequiredString(formData, "campaignId");
  const stepNumber = readStepNumber(formData);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("sequence_steps")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("step_number", stepNumber);

  if (error) {
    throw error;
  }

  revalidateCampaign(campaignId);
  redirect(`/campaigns/${campaignId}?sequence=deleted`);
}

function readStepNumber(formData: FormData) {
  const stepNumber = Number.parseInt(readRequiredString(formData, "stepNumber"), 10);

  if (!Number.isSafeInteger(stepNumber) || !isSequenceStepNumber(stepNumber)) {
    throw new Error("Step number must be 1, 2, or 3.");
  }

  return stepNumber;
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
