"use server";

import { redirect } from "next/navigation";

import { setOwnerSession, verifyOwnerPassword } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = formData.get("password");

  if (typeof password !== "string" || password.length === 0) {
    redirect("/login?error=missing-password");
  }

  let verified = false;

  try {
    verified = verifyOwnerPassword(password);
  } catch {
    redirect("/login?error=auth-not-configured");
  }

  if (!verified) {
    redirect("/login?error=invalid-password");
  }

  await setOwnerSession();
  redirect("/dashboard");
}
