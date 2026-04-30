import { NextRequest, NextResponse } from "next/server";

import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";
import { checkCampaignReplies } from "@/lib/reply-detection";

export async function POST(request: NextRequest) {
  const unauthorizedResponse = rejectUnauthorizedCronRequest(request);

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dry_run") === "1";
  const result = await checkCampaignReplies({ dryRun });

  return NextResponse.json(result);
}
