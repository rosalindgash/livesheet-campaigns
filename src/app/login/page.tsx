import { redirect } from "next/navigation";

import { getAuthEnvStatus, getOwnerSession } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  "auth-not-configured": "Authentication environment variables are not configured yet.",
  "invalid-password": "The password did not match the configured hash.",
  "missing-password": "Enter the owner password to continue.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getOwnerSession();

  if (session) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const authStatus = getAuthEnvStatus();
  const error = params?.error ? errorMessages[params.error] : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Private workspace</p>
        <h1>LiveSheet Campaigns</h1>
        <p className="muted">
          Sign in with the single-user owner password. The password is verified
          against a derived hash from the environment, never a plaintext value.
        </p>

        {!authStatus.configured ? (
          <div className="notice error">
            Missing auth env vars: {authStatus.missing.join(", ")}
          </div>
        ) : null}

        {error ? <div className="notice error">{error}</div> : null}

        <form action="/api/login" method="post" className="stack">
          <label htmlFor="password">Owner password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
