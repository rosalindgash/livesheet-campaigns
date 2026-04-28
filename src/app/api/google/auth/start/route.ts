import { NextResponse, type NextRequest } from "next/server";

import { requireOwnerSession } from "@/lib/auth";
import { buildGoogleAuthUrl, getGoogleOAuthEnvStatus } from "@/lib/google/oauth";
import { createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/google/state";

export async function GET(request: NextRequest) {
  await requireOwnerSession();

  if (!getGoogleOAuthEnvStatus().configured) {
    return NextResponse.redirect(new URL("/dashboard?google=missing-env", request.url));
  }

  const state = createGoogleOAuthState();
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
