import Link from "next/link";

import { CampaignForm } from "@/app/campaigns/CampaignForm";
import { updateCampaign } from "@/app/campaigns/actions";
import { requireOwnerSession } from "@/lib/auth";
import { getCampaign, getCampaignFormOptions } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  await requireOwnerSession();
  const { campaignId } = await params;
  const [campaign, options] = await Promise.all([
    getCampaign(campaignId),
    getCampaignFormOptions(),
  ]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h1>Edit campaign</h1>
        </div>
        <div className="topbar-actions">
          <Link href={`/campaigns/${campaign.id}`} prefetch={false}>Details</Link>
          <Link href="/campaigns" prefetch={false}>Campaigns</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </div>
      </header>

      <section className="panel">
        <CampaignForm
          action={updateCampaign}
          campaign={campaign}
          options={options}
          submitLabel="Save campaign"
        />
      </section>
    </main>
  );
}
