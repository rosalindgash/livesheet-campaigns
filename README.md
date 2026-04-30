# LiveSheet Campaigns

Single-user Google Sheets and Gmail outreach sequencer. Phase 11 contains the
app foundation, Google OAuth connection, encrypted token storage, token refresh
handling, connected account display, disconnect, campaign CRUD, Google Sheets
validation, worksheet/header checks, row preview, column mapping, and
non-sending saved message template management with a basic HTML body editor and
preview rendering. It also includes owner-only Gmail test sends that render a
saved template against a selected Sheet preview row, apply unsubscribe-link
handling, check global suppression before sending, and persist test send history.
Phase 7 added guarded manual Touch 1 campaign runs that read the Sheet fresh,
enforce campaign/global daily caps, send through Gmail, write `send_history`,
update eligible Sheet rows after successful or failed sends, and log
`campaign_runs`. Phase 8 adds scheduled execution through a protected cron
endpoint that reuses the same runner and duplicate-run protections. Phase 9
extends the shared runner to execute active Touch 1, Touch 2, and Touch 3 saved
templates based on each Sheet row's stage and delay timing. Phase 10 adds an
owner-only suppression admin page for manual suppressions and unsubscribe-event
review. Phase 11 adds basic Gmail reply detection for campaign sends.

Click/open tracking, CRM features, public SaaS features, billing, and teams are
intentionally not implemented yet.

## Local Setup Checklist

1. Install dependencies:

```bash
npm install
```

2. Create local environment values:

```bash
cp .env.example .env.local
```

3. Generate the owner password hash. Paste only the generated hash into
`AUTH_PASSWORD_HASH`; do not place the plaintext password in any env file.

```bash
npm run auth:hash
```

4. Generate a signing secret for `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

5. Fill in environment values in `.env.local`:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_OWNER_EMAIL=
AUTH_PASSWORD_HASH=
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/auth/callback
TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
```

Generate `TOKEN_ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Generate `CRON_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

6. Apply the database migrations in `supabase/migrations`.
Use the Supabase SQL editor, or apply it through your preferred Supabase CLI flow.

7. Seed the single global settings row after the migration:

```sql
insert into public.app_settings (owner_email, global_daily_send_cap, timezone)
values ('you@example.com', 70, 'America/Chicago');
```

8. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`, sign in with the owner password, and verify the
dashboard loads. Use the Google account panel to connect or disconnect the
owner Google account. Use `/campaigns` to create, edit, pause, resume, and
delete draft campaign records. Open a campaign detail page to validate the
configured Google Sheet, preview rows, save column mappings, and preview
rendered templates against selected Sheet rows. Saved message templates support
up to three touches per campaign. Body templates support basic sanitized HTML,
and owner-only test sends can send a rendered template to `APP_OWNER_EMAIL` or
an explicitly confirmed owner-controlled test inbox. Minimal unsubscribe links
and global suppression records are enforced before test sends and manual
campaign runs. Scheduled runs use the same campaign runner as manual runs. Use
the guarded `Run now` button and any scheduled-send tests only with sandbox
Sheets that contain owner-controlled email addresses while testing. Campaign
runs can send up to three touches: Step 1 for new rows, Step 2 for rows staged
`touch_1_sent` after the Step 2 delay has elapsed, and Step 3 for rows staged
`touch_2_sent` after the Step 3 delay has elapsed.

Use `/admin/suppressions` to add or remove manual suppressions, review blocked
recipients, and inspect recent unsubscribe confirmations. Suppressed emails are
blocked before campaign sending across all touch levels.

## Environment Variables

- `NEXT_PUBLIC_APP_URL`: Public app URL used to build unsubscribe links.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only Supabase service role key.
- `APP_OWNER_EMAIL`: Single owner email used for login identity and safe test-send defaults.
- `AUTH_PASSWORD_HASH`: PBKDF2 password hash from `npm run auth:hash`.
- `AUTH_SECRET`: Random secret used to sign owner session cookies.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `GOOGLE_REDIRECT_URI`: OAuth callback URL, usually
  `http://localhost:3000/api/google/auth/callback` locally.
- `TOKEN_ENCRYPTION_KEY`: 32-byte base64 key used to encrypt Google OAuth tokens.
- `CRON_SECRET`: Bearer token required by cron endpoints.
- `DEFAULT_TIMEZONE`: Fallback campaign/settings timezone.
- `DEFAULT_GLOBAL_DAILY_SEND_CAP`: Fallback global daily send cap.

For Vercel production, configure these environment variable names in the
project settings:

```text
NEXT_PUBLIC_APP_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_OWNER_EMAIL
AUTH_PASSWORD_HASH
AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
TOKEN_ENCRYPTION_KEY
CRON_SECRET
DEFAULT_TIMEZONE
DEFAULT_GLOBAL_DAILY_SEND_CAP
```

## Google OAuth Summary

Create a Google OAuth client, add the local callback URL to authorized redirect
URIs, and request Gmail/Sheets consent from the owner Google account. The app
uses Google Sheets access for validation/writeback, Gmail send access for
campaign/test sends, and Gmail modify access for reply-thread inspection.

## Safe Testing

- Use the Demo campaign and sandbox Sheets with owner-controlled inboxes only.
- Use template test sends to verify rendering without Sheet writeback.
- Use the top Manual Run panel only when you intend to send real campaign email.
- Keep the manual run confirmation checkbox in place.
- Use cron `dryRun=1` before real scheduled or reply-detection checks.
- Keep Demo paused when not actively testing.
- Verify suppression and replied rows before testing follow-ups.

## Cron Configuration

The scheduler endpoint is:

```text
GET or POST /api/cron/run-due-campaigns
```

Every request must include `CRON_SECRET` as a bearer token:

```http
Authorization: Bearer your-cron-secret
```

Local dry-run check from PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/cron/run-due-campaigns?dryRun=1" `
  -Headers @{ Authorization = "Bearer your-cron-secret" }
```

Dry runs report which active campaigns are due without sending email. You can
also pass `now` during dry runs to inspect due logic without waiting for the
saved send time:

```text
/api/cron/run-due-campaigns?dryRun=1&now=2026-04-30T08:00:00-05:00
```

Production cron should call:

```text
GET https://your-domain.example/api/cron/run-due-campaigns
Authorization: Bearer your-cron-secret
```

Actual scheduled requests without `dryRun=1` send real email for due active
campaigns. Keep production cron secret-protected and test only with sandbox
Sheets and owner-controlled inboxes.

Vercel Cron sends `GET` requests. When `CRON_SECRET` is configured in Vercel,
Vercel sends it automatically as `Authorization: Bearer <CRON_SECRET>`, which
matches this app's cron authentication. Local/manual testing can still use
`POST` with the same bearer header.

Optional Vercel cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/cron/run-due-campaigns",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/check-replies",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

Vercel cron schedules use UTC. Verify your Vercel plan's cron frequency limits
before adding `vercel.json`; Hobby projects may require once-daily schedules.
The scheduler still evaluates each campaign's own `send_days`, `send_time`, and
`timezone` before sending.

## Reply Detection

The reply detection endpoint is:

```text
GET or POST /api/cron/check-replies
```

Every request must include `CRON_SECRET` as a bearer token:

```http
Authorization: Bearer your-cron-secret
```

Local dry-run check from PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/cron/check-replies?dryRun=1" `
  -Headers @{ Authorization = "Bearer your-cron-secret" }
```

Dry runs inspect eligible campaign send threads without writing
`reply_events`, updating `send_history`, or writing back to Google Sheets.
Normal runs record detected replies, mark the related send as
`reply_detected`, and write `status = replied` plus `replied_at` to the source
Sheet row when row information is available.

## Verification

```bash
npm run lint
npm run build
```

## Deployment Notes

Apply all Supabase migrations before deploying. Configure all production
environment variables in Vercel before the first production deploy. Set
`NEXT_PUBLIC_APP_URL` to the production app URL and set `GOOGLE_REDIRECT_URI` to
the production callback URL:

```text
https://your-production-domain.example/api/google/auth/callback
```

Add that same production callback URL to the Google OAuth client's authorized
redirect URIs. Keep the local callback URL authorized if you still test locally.

Do not commit `.env.local`, `.env.production`, Vercel `.env` downloads, or any
secret-bearing files. This repo's `.gitignore` ignores `.env*` while allowing
`.env.example`.

Vercel deployment checklist:

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Set the production environment variables listed above.
4. Apply Supabase migrations before using the deployed app.
5. Redeploy after changing environment variables.
6. Connect Google OAuth from the deployed app once the production redirect URI
   is configured.
7. Add optional Vercel Cron schedules only after confirming campaigns are paused
   or sandbox-safe.

Production cron should call the scheduler and reply detection endpoints with
`GET` and `Authorization: Bearer <CRON_SECRET>`. Vercel can supply that header
automatically when `CRON_SECRET` is set.

### Production Auth Troubleshooting

If the deployed app accepts the owner password but protected navigation returns
to `/login`, check the production environment variables first:

- `AUTH_SECRET` must be set and stable across deployments.
- `AUTH_PASSWORD_HASH` must be the generated hash, not the plaintext password.
- `APP_OWNER_EMAIL` must match the intended owner account value.
- `NEXT_PUBLIC_APP_URL` should match the deployed HTTPS app URL.

The owner session is stored in an HTTP-only signed cookie with `secure` enabled
in production, `sameSite=lax`, `path=/`, and no explicit cookie domain. Avoid
setting a cookie domain unless the app is intentionally served from multiple
subdomains and that behavior has been tested.

If auth appears to work only while browser DevTools is open, clear the browser
site data for the deployed domain after redeploying. DevTools often disables
cache, so that symptom usually points to stale cached navigation data rather
than a bad password hash.

## Security Notes

- The owner password is never stored directly in `.env.local`; only a PBKDF2
  derived hash is used.
- Session cookies are signed, HTTP-only, same-site `lax`, path-scoped to `/`,
  and marked `secure` when `NODE_ENV=production`.
- Supabase access uses the server-only service role key. Do not expose it to
  client components.
- Google OAuth tokens are encrypted before storage and are never exposed to the
  frontend.
