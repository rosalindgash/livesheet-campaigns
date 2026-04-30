import { NextRequest, NextResponse } from "next/server";

import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";
import { checkCampaignReplies } from "@/lib/reply-detection";

export const dynamic = "force-dynamic";

async function handleCheckReplies(request: NextRequest) {
  const unauthorizedResponse = rejectUnauthorizedCronRequest(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dry_run") === "1";
  const result = await checkCampaignReplies({ dryRun });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleCheckReplies(request);
}

export async function POST(request: NextRequest) {
  return handleCheckReplies(request);
}
