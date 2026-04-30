import { redirect } from "next/navigation";

import { getOwnerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const session = await getOwnerSession();

  redirect(session ? "/dashboard" : "/login");
}
