import Link from "next/link";

import { deleteCampaign, pauseCampaign, resumeCampaign } from "@/app/campaigns/actions";
import { requireOwnerSession } from "@/lib/auth";
import { getCampaign } from "@/lib/campaigns";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  await requireOwnerSession();
  const { campaignId } = await params;
  const campaign = await getCampaign(campaignId);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Campaign</p>
          <h1>{campaign.name}</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/campaigns">Campaigns</Link>
          <Link href={`/campaigns/${campaign.id}/edit`}>Edit</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="grid three">
        <Metric label="Status" value={campaign.status} />
        <Metric label="Daily cap" value={campaign.dailySendCap.toString()} />
        <Metric label="Send time" value={campaign.sendTime} />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Details</p>
              <h2>Campaign setup</h2>
            </div>
            <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>
          </div>
          <dl className="details-list">
            <Detail label="Description" value={campaign.description || "No description"} />
            <Detail label="Google account" value={campaign.googleAccountEmail ?? "Not selected"} />
            <Detail label="Sheet URL" value={campaign.sheetUrl ?? "Not set"} />
            <Detail label="Parsed sheet ID" value={campaign.sheetId ?? "Not parsed"} />
            <Detail label="Worksheet/tab" value={campaign.worksheetName ?? "Not set"} />
            <Detail label="Timezone" value={campaign.timezone} />
            <Detail label="Send days" value={campaign.sendDays.join(", ")} />
          </dl>
        </div>

        <div className="panel">
          <h2>Run history placeholders</h2>
          <dl className="details-list">
            <Detail label="Last run" value={formatOptionalDate(campaign.lastRunAt)} />
            <Detail
              label="Last successful run"
              value={formatOptionalDate(campaign.lastSuccessfulRunAt)}
            />
            <Detail label="Created" value={formatOptionalDate(campaign.createdAt)} />
            <Detail label="Updated" value={formatOptionalDate(campaign.updatedAt)} />
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="row-actions">
          {campaign.status === "active" ? (
            <form action={pauseCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button type="submit">Pause campaign</button>
            </form>
          ) : (
            <form action={resumeCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button type="submit">Resume campaign</button>
            </form>
          )}
          <form action={deleteCampaign}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button className="danger-button" type="submit">
              Delete campaign
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
