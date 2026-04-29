import { getUnsubscribeSendRecord } from "@/lib/unsubscribe";

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const { status } = await searchParams;
  const sendRecord = await getUnsubscribeSendRecord(token);

  return (
    <main className="auth-page">
      <section className="auth-card unsubscribe-card">
        <p className="eyebrow">LiveSheet Campaigns</p>
        <h1>Unsubscribe</h1>

        {!sendRecord ? (
          <p className="muted">
            This unsubscribe link is invalid or has expired. No changes were made.
          </p>
        ) : status === "success" ? (
          <p className="muted">
            You have been unsubscribed. Future sends to {sendRecord.recipientEmail} will be
            skipped.
          </p>
        ) : (
          <>
            <p className="muted">
              Confirm that you want to stop future email from this sender to{" "}
              {sendRecord.recipientEmail}.
            </p>
            <form action={`/api/unsubscribe/${token}`} className="stack" method="post">
              <button type="submit">Confirm unsubscribe</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
