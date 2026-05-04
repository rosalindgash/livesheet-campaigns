import Link from "next/link";

import { requireOwnerSession } from "@/lib/auth";
import {
  getSuppressionAdminSnapshot,
  SUPPRESSION_REASONS,
  type BounceEventEntry,
  type SuppressionListEntry,
  type UnsubscribeEventEntry,
} from "@/lib/suppression-admin";

import { addSuppression, removeSuppression } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const suppressionMessages: Record<string, string> = {
  added: "Suppression added.",
  failed: "Suppression could not be saved.",
  "invalid-email": "Enter a valid email address.",
  "invalid-reason": "Select a valid suppression reason.",
  "remove-failed": "Suppression could not be removed.",
  removed: "Suppression removed.",
};

export default async function SuppressionsPage({
  searchParams,
}: {
  searchParams: Promise<{ suppression?: string }>;
}) {
  const session = await requireOwnerSession();
  const params = await searchParams;
  const snapshot = await getSuppressionAdminSnapshot();
  const message = params.suppression ? suppressionMessages[params.suppression] : null;
  const isError = params.suppression?.includes("failed") || params.suppression?.includes("invalid");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Suppressions</h1>
        </div>
        <div className="topbar-actions">
          <span>{session.email}</span>
          <Link href="/campaigns" prefetch={false}>Campaigns</Link>
          <Link href="/dashboard" prefetch={false}>Dashboard</Link>
        </div>
      </header>

      {message ? <div className={isError ? "notice error" : "notice"}>{message}</div> : null}

      <section className="panel compact">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Manual suppression</p>
            <h2>Add or update an email</h2>
          </div>
        </div>
        <form action={addSuppression} className="form-grid">
          <label className="field">
            <span>Email</span>
            <input name="email" required type="email" />
          </label>

          <label className="field">
            <span>Reason</span>
            <select name="reason" required defaultValue="manual_suppression">
              {SUPPRESSION_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {formatReason(reason)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Campaign</span>
            <select name="campaignId" defaultValue="">
              <option value="">Global suppression</option>
              {snapshot.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Notes</span>
            <input name="notes" />
          </label>

          <div className="form-actions full">
            <button type="submit">Save suppression</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Suppression list</p>
            <h2>Blocked recipients</h2>
          </div>
        </div>
        {snapshot.suppressions.length > 0 ? (
          <div className="table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Campaign</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.suppressions.map((entry) => (
                  <SuppressionRow entry={entry} key={entry.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No suppressed recipients yet.</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bounce handling</p>
            <h2>Recent bounces</h2>
          </div>
        </div>
        {snapshot.bounceEvents.length > 0 ? (
          <div className="table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Campaign</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Detected</th>
                  <th>Source</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.bounceEvents.map((event) => (
                  <BounceEventRow event={event} key={event.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No Gmail bounces detected yet.</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Unsubscribe events</p>
            <h2>Recent confirmations</h2>
          </div>
        </div>
        {snapshot.unsubscribeEvents.length > 0 ? (
          <div className="table-wrap">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Campaign</th>
                  <th>Unsubscribed</th>
                  <th>Token</th>
                  <th>User agent</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.unsubscribeEvents.map((event) => (
                  <UnsubscribeEventRow event={event} key={event.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No unsubscribe confirmations yet.</p>
        )}
      </section>
    </main>
  );
}

function BounceEventRow({ event }: { event: BounceEventEntry }) {
  return (
    <tr>
      <td>{event.recipientEmail ?? "Needs review"}</td>
      <td>{event.campaignName ?? "Unmatched"}</td>
      <td>{formatAction(event.action, event.confidence)}</td>
      <td>{event.statusCode ?? ""}</td>
      <td>{formatDate(event.detectedAt)}</td>
      <td>{shortenToken(event.rawSourceMessageId)}</td>
      <td>{event.reason ?? ""}</td>
    </tr>
  );
}

function SuppressionRow({ entry }: { entry: SuppressionListEntry }) {
  return (
    <tr>
      <td>{entry.email}</td>
      <td>{formatReason(entry.reason)}</td>
      <td>{entry.campaignName ?? "Global"}</td>
      <td>{entry.source}</td>
      <td>{formatDate(entry.createdAt)}</td>
      <td>{entry.notes ?? ""}</td>
      <td>
        <form action={removeSuppression}>
          <input name="suppressionId" type="hidden" value={entry.id} />
          <button className="danger-button small-button" type="submit">
            Remove
          </button>
        </form>
      </td>
    </tr>
  );
}

function UnsubscribeEventRow({ event }: { event: UnsubscribeEventEntry }) {
  return (
    <tr>
      <td>{event.recipientEmail}</td>
      <td>{event.campaignName ?? "Global"}</td>
      <td>{formatDate(event.unsubscribedAt)}</td>
      <td>{shortenToken(event.token)}</td>
      <td>{event.userAgent ?? ""}</td>
    </tr>
  );
}

function formatAction(action: BounceEventEntry["action"], confidence: BounceEventEntry["confidence"]): string {
  if (action === "suppressed") {
    return "Suppressed";
  }

  return confidence === "low" ? "Manual review" : "Logged";
}

function formatReason(reason: string): string {
  return reason
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortenToken(token: string): string {
  return token.length > 16 ? `${token.slice(0, 8)}...${token.slice(-6)}` : token;
}
