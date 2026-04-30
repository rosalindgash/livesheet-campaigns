import Link from "next/link";

import { CampaignForm } from "@/app/campaigns/CampaignForm";
import { createCampaign } from "@/app/campaigns/actions";
import { requireOwnerSession } from "@/lib/auth";
import { getCampaignFormOptions } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewCampaignPage() {
  await requireOwnerSession();
  const options = await getCampaignFormOptions();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h1>New campaign</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/campaigns" prefetch={false}>Campaigns</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <CampaignForm action={createCampaign} options={options} submitLabel="Create campaign" />
      </section>
    </main>
  );
}
