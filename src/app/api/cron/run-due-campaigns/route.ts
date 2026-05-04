import { NextRequest, NextResponse } from "next/server";

import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";
import { runDueCampaigns } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

async function handleRunDueCampaigns(request: NextRequest) {
  const unauthorizedResponse = rejectUnauthorizedCronRequest(request);

  if (unauthorizedResponse) {
    console.warn("run-due-campaigns cron rejected unauthorized request", {
      method: request.method,
      path: new URL(request.url).pathname,
      userAgent: request.headers.get("user-agent"),
    });
    return unauthorizedResponse;
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dry_run") === "1";
  const nowParam = searchParams.get("now");
  const now = dryRun && nowParam ? new Date(nowParam) : new Date();

  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: "Invalid now timestamp." }, { status: 400 });
  }

  console.info("run-due-campaigns cron request accepted", {
    dryRun,
    method: request.method,
    path: new URL(request.url).pathname,
    userAgent: request.headers.get("user-agent"),
  });

  const result = await runDueCampaigns({ dryRun, now });

  console.info("run-due-campaigns cron request finished", {
    dryRun: result.dryRun,
    resultCount: result.results.length,
    startedCount: result.results.filter((item) => item.action === "started").length,
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleRunDueCampaigns(request);
}

export async function POST(request: NextRequest) {
  return handleRunDueCampaigns(request);
}
