import { NextResponse, type NextRequest } from "next/server";

import { requireOwnerSession } from "@/lib/auth";
import { disconnectGoogleAccount } from "@/lib/google/accounts";

export async function POST(request: NextRequest) {
  await requireOwnerSession();

  try {
    await disconnectGoogleAccount();

    return NextResponse.redirect(new URL("/dashboard?google=disconnected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard?google=disconnect-failed", request.url));
  }
}
