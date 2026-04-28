import { redirect } from "next/navigation";

import { clearOwnerSession } from "@/lib/auth";

export async function GET() {
  await clearOwnerSession();
  redirect("/login");
}
