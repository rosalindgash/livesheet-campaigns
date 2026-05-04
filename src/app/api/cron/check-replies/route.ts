import { NextRequest, NextResponse } from "next/server";

import { processGmailBounces } from "@/lib/bounce-detection";
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
  const [replyResult, bounceResult] = await Promise.all([
    checkCampaignReplies({ dryRun }),
    processGmailBounces({ dryRun }),
  ]);

  return NextResponse.json({
    bounces: bounceResult,
    dryRun,
    replies: replyResult,
  });
}

export async function GET(request: NextRequest) {
  return handleCheckReplies(request);
}

export async function POST(request: NextRequest) {
  return handleCheckReplies(request);
}
