# LiveSheet Campaigns

Single-user Google Sheets and Gmail outreach sequencer. Phase 9 contains the
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
review.

Reply detection, click/open tracking, and public SaaS features are intentionally
not implemented yet.

## Local Setup

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

5. Fill in Supabase values in `.env.local`:

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

## Cron Configuration

The scheduler endpoint is:

```text
POST /api/cron/run-due-campaigns
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
POST https://your-domain.example/api/cron/run-due-campaigns
Authorization: Bearer your-cron-secret
```

Actual scheduled requests without `dryRun=1` send real email for due active
campaigns. Keep production cron secret-protected and test only with sandbox
Sheets and owner-controlled inboxes.

## Verification

```bash
npm run lint
npm run build
```

## Security Notes

- The owner password is never stored directly in `.env.local`; only a PBKDF2
  derived hash is used.
- Session cookies are signed, HTTP-only, same-site `lax`, path-scoped to `/`,
  and marked `secure` when `NODE_ENV=production`.
- Supabase access uses the server-only service role key. Do not expose it to
  client components.
- Google OAuth tokens are encrypted before storage and are never exposed to the
  frontend.
