import { NextResponse, type NextRequest } from "next/server";

import { requireOwnerSession } from "@/lib/auth";
import { storeGoogleAccount } from "@/lib/google/accounts";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { consumeGoogleOAuthState } from "@/lib/google/state";

export async function GET(request: NextRequest) {
  await requireOwnerSession();

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL("/dashboard?google=oauth-denied", request.url));
  }

  if (!code || !state || !(await consumeGoogleOAuthState(state))) {
    return NextResponse.redirect(new URL("/dashboard?google=invalid-state", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await storeGoogleAccount(tokens);

    return NextResponse.redirect(new URL("/dashboard?google=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard?google=connect-failed", request.url));
  }
}
