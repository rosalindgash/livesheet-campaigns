"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwnerSession } from "@/lib/auth";
import {
  isSuppressionReason,
  normalizeSuppressionEmail,
} from "@/lib/suppression-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function addSuppression(formData: FormData) {
  await requireOwnerSession();

  const email = normalizeSuppressionEmail(readRequiredString(formData, "email"));
  const reason = readRequiredString(formData, "reason");
  const campaignId = readOptionalString(formData, "campaignId");
  const notes = readOptionalString(formData, "notes");

  if (!isEmail(email)) {
    redirect("/admin/suppressions?suppression=invalid-email");
  }

  if (!isSuppressionReason(reason)) {
    redirect("/admin/suppressions?suppression=invalid-reason");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("suppression_list").upsert(
    {
      campaign_id: campaignId,
      email,
      notes,
      reason,
      source: "manual_admin",
    },
    { onConflict: "email" },
  );

  if (error) {
    redirect("/admin/suppressions?suppression=failed");
  }

  revalidatePath("/admin/suppressions");
  redirect("/admin/suppressions?suppression=added");
}

export async function removeSuppression(formData: FormData) {
  await requireOwnerSession();

  const suppressionId = readRequiredString(formData, "suppressionId");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("suppression_list").delete().eq("id", suppressionId);

  if (error) {
    redirect("/admin/suppressions?suppression=remove-failed");
  }

  revalidatePath("/admin/suppressions");
  redirect("/admin/suppressions?suppression=removed");
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

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
