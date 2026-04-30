import { timingSafeEqual } from "crypto";

import { NextRequest, NextResponse } from "next/server";

export function rejectUnauthorizedCronRequest(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

function hasValidCronSecret(request: NextRequest, cronSecret: string): boolean {
  const authorization = request.headers.get("authorization");
  const bearerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const providedSecret = bearerSecret ?? request.headers.get("x-cron-secret");

  if (!providedSecret) {
    return false;
  }

  const expected = Buffer.from(cronSecret);
  const received = Buffer.from(providedSecret);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
