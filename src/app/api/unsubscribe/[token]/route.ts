import { NextResponse, type NextRequest } from "next/server";

import { confirmUnsubscribe } from "@/lib/unsubscribe";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ipAddress = getClientIp(request);

  await confirmUnsubscribe({
    ipAddress,
    token,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.redirect(new URL(`/unsubscribe/${token}?status=success`, request.url));
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
}
