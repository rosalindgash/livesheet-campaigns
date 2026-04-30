import { NextRequest, NextResponse } from "next/server";

import {
  clearOwnerSession,
  getOwnerSessionCookieName,
  getOwnerSessionCookieOptions,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  await clearOwnerSession();

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.cookies.set(getOwnerSessionCookieName(), "", {
    ...getOwnerSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
