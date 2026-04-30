import { timingSafeEqual } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { runDueCampaigns } from "@/lib/scheduler";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  if (!hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dry_run") === "1";
  const nowParam = searchParams.get("now");
  const now = dryRun && nowParam ? new Date(nowParam) : new Date();

  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: "Invalid now timestamp." }, { status: 400 });
  }

  const result = await runDueCampaigns({ dryRun, now });

  return NextResponse.json(result);
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
