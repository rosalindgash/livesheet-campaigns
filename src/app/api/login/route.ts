import { NextRequest, NextResponse } from "next/server";

import {
  createOwnerSessionToken,
  getOwnerSessionCookieName,
  getOwnerSessionCookieOptions,
  verifyOwnerPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || password.length === 0) {
    return redirectToLogin(request, "missing-password");
  }

  let verified = false;

  try {
    verified = verifyOwnerPassword(password);
  } catch {
    return redirectToLogin(request, "auth-not-configured");
  }

  if (!verified) {
    return redirectToLogin(request, "invalid-password");
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  response.cookies.set(
    getOwnerSessionCookieName(),
    createOwnerSessionToken(),
    getOwnerSessionCookieOptions(),
  );

  return response;
}

function redirectToLogin(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url), { status: 303 });
}
