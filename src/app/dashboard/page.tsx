import Link from "next/link";

import { requireOwnerSession } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const phaseCards = [
  {
    title: "Project foundation",
    body: "Next.js, TypeScript, ESLint, Supabase dependency, and environment contract are in place.",
    status: "Complete",
  },
  {
    title: "Single-user access",
    body: "Dashboard access is protected by an HTTP-only signed session cookie and env-derived password hash.",
    status: "Complete",
  },
  {
    title: "Google connection",
    body: "OAuth connection, encrypted token storage, token refresh, account display, and disconnect are in place.",
    status: "Phase 2",
  },
  {
    title: "Campaign engine",
    body: "Campaign CRUD, Sheets reads, Gmail sending, scheduling, and multi-touch sequences are in place.",
    status: "Complete",
  },
];

const googleMessages: Record<string, string> = {
  connected: "Google account connected.",
  disconnected: "Google account disconnected.",
  "missing-env": "Google OAuth environment values are missing.",
  "oauth-denied": "Google authorization was cancelled.",
  "invalid-state": "Google OAuth state validation failed. Try connecting again.",
  "connect-failed": "Google account connection failed.",
  "disconnect-failed": "Google account disconnect failed.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const session = await requireOwnerSession();
  const snapshot = await getDashboardSnapshot();
  const params = await searchParams;
  const googleMessage = params.google ? googleMessages[params.google] : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LiveSheet Campaigns</p>
          <h1>Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <span>{session.email}</span>
          <Link href="/campaigns" prefetch={false}>Campaigns</Link>
          <Link href="/admin/suppressions" prefetch={false}>Suppressions</Link>
          <Link href="/logout" prefetch={false}>Sign out</Link>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Owner outreach dashboard</h2>
          <p className="muted">
            Monitor campaign readiness, send activity, Google connection
            status, suppression controls, and recent runs from one place.
          </p>
        </div>
      </section>

      {googleMessage ? <div className="notice">{googleMessage}</div> : null}

      <section className="grid three">
        <Metric label="Campaigns" value={snapshot.totals.campaigns.toString()} />
        <Metric label="Sent today" value={snapshot.totals.sentToday.toString()} />
        <Metric label="Recent runs" value={snapshot.totals.recentRuns.toString()} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Campaigns</p>
            <h2>Recent campaign status</h2>
          </div>
          <Link className="button-link" href="/campaigns/new" prefetch={false}>
            New campaign
          </Link>
        </div>

        {snapshot.campaigns.length > 0 ? (
          <div className="campaign-list">
            {snapshot.campaigns.slice(0, 5).map((campaign) => (
              <Link
                className="campaign-list-item"
                href={`/campaigns/${campaign.id}`}
                key={campaign.id}
                prefetch={false}
              >
                <div>
                  <strong>{campaign.name}</strong>
                  <span>{campaign.googleAccountEmail ?? "No Google account selected"}</span>
                  <span>
                    {campaign.sendDays.join(", ") || "No send days"} at {campaign.sendTime}
                  </span>
                </div>
                <div>
                  <span className={`status-pill ${campaign.status}`}>{campaign.status}</span>
                  <span>{campaign.dailySendCap}/day</span>
                  <span>Last run: {formatOptionalDate(campaign.lastRunAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">No campaigns yet. Create the first draft campaign when ready.</p>
        )}
      </section>

      <section className="grid two">
        <div className="panel">
          <h2>Setup status</h2>
          <StatusRow
            label="Auth environment"
            ok={snapshot.auth.configured}
            detail={
              snapshot.auth.configured
                ? "Configured"
                : `Missing: ${snapshot.auth.missing.join(", ")}`
            }
          />
          <StatusRow
            label="Supabase environment"
            ok={snapshot.database.configured}
            detail={
              snapshot.database.configured
                ? "Configured"
                : `Missing: ${snapshot.database.missing.join(", ")}`
            }
          />
          <StatusRow
            label="Database connection"
            ok={snapshot.database.reachable}
            detail={
              snapshot.database.reachable
                ? "Reachable"
                : snapshot.database.error ?? "Not checked until Supabase env is configured"
              }
          />
          <StatusRow
            label="Google OAuth environment"
            ok={snapshot.google.configured}
            detail={
              snapshot.google.configured
                ? "Configured"
                : `Missing: ${snapshot.google.missing.join(", ")}`
            }
          />
        </div>

        <div className="panel">
          <h2>Global settings</h2>
          <dl className="details-list">
            <div>
              <dt>Owner email</dt>
              <dd>{snapshot.settings.ownerEmail ?? "Not seeded"}</dd>
            </div>
            <div>
              <dt>Global daily cap</dt>
              <dd>{snapshot.settings.globalDailySendCap ?? "Not seeded"}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{snapshot.settings.timezone ?? "Not seeded"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Google OAuth</p>
            <h2>Connected account</h2>
          </div>
          {snapshot.google.account ? (
            <form action="/api/google/disconnect" method="post">
              <button className="danger-button" type="submit">
                Disconnect
              </button>
            </form>
          ) : (
            <a className="button-link" href="/api/google/auth/start">
              Connect Google
            </a>
          )}
        </div>

        {snapshot.google.error ? (
          <div className="notice error">{snapshot.google.error}</div>
        ) : null}

        {snapshot.google.account ? (
          <dl className="details-list account-details">
            <div>
              <dt>Email</dt>
              <dd>{snapshot.google.account.email}</dd>
            </div>
            <div>
              <dt>Token status</dt>
              <dd>{formatRefreshStatus(snapshot.google.account.refreshStatus)}</dd>
            </div>
            <div>
              <dt>Token expiry</dt>
              <dd>{formatDate(snapshot.google.account.tokenExpiry)}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>{snapshot.google.account.scope}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            No Google account is connected. Connect the owner account before
            later phases use Sheets or Gmail.
          </p>
        )}

        {snapshot.google.account?.refreshError ? (
          <div className="notice error">{snapshot.google.account.refreshError}</div>
        ) : null}
      </section>

      <section className="grid three">
        {phaseCards.map((card) => (
          <article className="panel" key={card.title}>
            <p className="badge">{card.status}</p>
            <h2>{card.title}</h2>
            <p className="muted">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return formatDate(value);
}

function formatRefreshStatus(status: string) {
  if (status === "refreshed") {
    return "Refreshed";
  }

  if (status === "unavailable") {
    return "Refresh pending env setup";
  }

  if (status === "failed") {
    return "Refresh failed";
  }

  return "Current";
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="status-row">
      <span className={ok ? "status-dot ok" : "status-dot"} />
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
