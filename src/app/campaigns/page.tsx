import Link from "next/link";

import { deleteCampaign, pauseCampaign, resumeCampaign } from "@/app/campaigns/actions";
import { requireOwnerSession } from "@/lib/auth";
import { listCampaigns, type Campaign } from "@/lib/campaigns";

export default async function CampaignsPage() {
  const session = await requireOwnerSession();
  const campaigns = await listCampaigns();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LiveSheet Campaigns</p>
          <h1>Campaigns</h1>
        </div>
        <div className="topbar-actions">
          <span>{session.email}</span>
          <Link href="/admin/suppressions">Suppressions</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/campaigns/new">New campaign</Link>
        </div>
      </header>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Phase 3</p>
            <h2>Campaign management</h2>
          </div>
          <Link className="button-link" href="/campaigns/new">
            Create campaign
          </Link>
        </div>

        {campaigns.length > 0 ? (
          <div className="table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Google account</th>
                  <th>Worksheet</th>
                  <th>Send plan</th>
                  <th>Last run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <CampaignRow campaign={campaign} key={campaign.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No campaigns have been created yet.</p>
        )}
      </section>
    </main>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  return (
    <tr>
      <td>
        <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        <span className="subtle">{campaign.sheetId ?? "Sheet ID not parsed"}</span>
      </td>
      <td>
        <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>
      </td>
      <td>{campaign.googleAccountEmail ?? "Not selected"}</td>
      <td>{campaign.worksheetName ?? "Not set"}</td>
      <td>
        {campaign.dailySendCap}/day at {campaign.sendTime}
        <span className="subtle">{campaign.sendDays.join(", ")}</span>
      </td>
      <td>{formatOptionalDate(campaign.lastRunAt)}</td>
      <td className="action-cell">
        <div className="row-actions">
          <Link href={`/campaigns/${campaign.id}`}>View</Link>
          <Link href={`/campaigns/${campaign.id}/edit`}>Edit</Link>
          {campaign.status === "active" ? (
            <form action={pauseCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button className="small-button" type="submit">
                Pause
              </button>
            </form>
          ) : (
            <form action={resumeCampaign}>
              <input name="campaignId" type="hidden" value={campaign.id} />
              <button className="small-button" type="submit">
                Resume
              </button>
            </form>
          )}
          <form action={deleteCampaign}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button className="small-button danger-button" type="submit">
              Delete
            </button>
          </form>
        </div>
      </td>
    </tr>
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
