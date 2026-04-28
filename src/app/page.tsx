import { redirect } from "next/navigation";

import { getOwnerSession } from "@/lib/auth";

export default async function Home() {
  const session = await getOwnerSession();

  redirect(session ? "/dashboard" : "/login");
}
