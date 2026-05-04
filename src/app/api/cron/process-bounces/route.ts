import { NextRequest, NextResponse } from "next/server";

import { processGmailBounces } from "@/lib/bounce-detection";
import { rejectUnauthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

async function handleProcessBounces(request: NextRequest) {
  const unauthorizedResponse = rejectUnauthorizedCronRequest(request);

  if (unauthorizedResponse) {
    console.warn("process-bounces cron rejected unauthorized request", {
      method: request.method,
      path: new URL(request.url).pathname,
      userAgent: request.headers.get("user-agent"),
    });
    return unauthorizedResponse;
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dry_run") === "1";
  const maxMessages = Number.parseInt(searchParams.get("maxMessages") ?? "25", 10);

  if (!Number.isSafeInteger(maxMessages) || maxMessages < 1 || maxMessages > 100) {
    return NextResponse.json({ error: "maxMessages must be between 1 and 100." }, { status: 400 });
  }

  console.info("process-bounces cron request accepted", {
    dryRun,
    maxMessages,
    method: request.method,
    path: new URL(request.url).pathname,
    userAgent: request.headers.get("user-agent"),
  });

  const result = await processGmailBounces({ dryRun, maxMessagesPerAccount: maxMessages });

  console.info("process-bounces cron request finished", {
    detectedCount: result.bouncesDetected.length,
    dryRun: result.dryRun,
    errorCount: result.errors.length,
    messagesChecked: result.gmailMessagesChecked,
    suppressedCount: result.bouncesDetected.filter((item) => item.action === "suppressed").length,
  });

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleProcessBounces(request);
}

export async function POST(request: NextRequest) {
  return handleProcessBounces(request);
}
