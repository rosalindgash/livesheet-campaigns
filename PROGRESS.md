# LiveSheet Campaigns Progress

## Phase 1 - Project Setup

Status: complete, copied into the app folder, and verified on 2026-04-28.

## Phase 2 - Google OAuth

Status: complete; smoke test passed.

## Phase 3 - Campaign CRUD

Status: complete; manual smoke test passed with dummy/test data.

## Phase 4 - Google Sheets Validation

Status: complete and ready for review.

## Completed Work

- Read `BUILD_SPEC.md` fully and created a 12-phase implementation plan.
- Scaffolded a TypeScript Next.js app in `livesheet-campaigns`.
- Added Supabase JavaScript client dependency.
- Added a Supabase Postgres migration covering the MVP foundation tables:
  `app_settings`, `google_accounts`, `campaigns`, `campaign_column_mappings`,
  `sequence_steps`, `send_history`, `campaign_runs`, `suppression_list`,
  `unsubscribe_events`, and `reply_events`.
- Added server-only Supabase admin client setup with environment checks.
- Added env-based single-user authentication using `APP_OWNER_EMAIL`,
  `AUTH_PASSWORD_HASH`, and `AUTH_SECRET`.
- Added a password hash generator so the plaintext password is never stored in
  `.env`.
- Added signed HTTP-only session cookies with `sameSite: "lax"` and
  `secure: true` in production.
- Added login, logout, root redirect, and protected dashboard routes.
- Added a simple dashboard shell showing setup status, database reachability,
  global settings, and placeholder Phase 1 metrics.
- Added `.env.example` with placeholders only.
- Replaced the generated README with project-specific setup and verification
  instructions.

## Phase 2 Completed Work

- Added Google OAuth start and callback routes:
  `GET /api/google/auth/start` and `GET /api/google/auth/callback`.
- Added secure OAuth state generation, HTTP-only state cookie storage, and
  timing-safe callback validation.
- Added Google token exchange and refresh handling using the OAuth token
  endpoint.
- Added AES-256-GCM token encryption for access and refresh tokens using
  `TOKEN_ENCRYPTION_KEY`.
- Added encrypted storage and upsert behavior for `google_accounts`.
- Added connected account loading on the dashboard, including Gmail address,
  token expiry, scopes, and refresh status.
- Added automatic access-token refresh when a stored token is close to expiry.
- Added `POST /api/google/disconnect` and a dashboard disconnect control.
- Kept campaign CRUD, Sheets access, Gmail sending, scheduling, and sequences
  out of Phase 2.

## Phase 3 Completed Work

- Added a campaign data/model helper for listing campaigns, loading campaign
  details, parsing Google Sheet IDs from sheet URLs, loading Google account
  options, and preparing form defaults.
- Added campaign create, update, pause, resume, and delete server actions.
- Added `/campaigns` dashboard list with status, Google account association,
  worksheet, send plan, last run placeholder, and row actions.
- Added `/campaigns/new` create form.
- Added `/campaigns/[campaignId]` detail page.
- Added `/campaigns/[campaignId]/edit` edit form.
- Added campaign cards to `/dashboard`.
- Added UI support for storing name, description, Google account association,
  sheet URL, parsed sheet ID, worksheet/tab name, status, daily send cap,
  timezone, send time, selected send days, and nullable last-run timestamps.
- Kept Google Sheets validation, Gmail sending, campaign execution, scheduling
  cron, template rendering, sequences, unsubscribe, and reply detection out of
  Phase 3.

## Phase 4 Completed Work

- Added Google Sheets API helpers using the connected Google account and
  refreshed OAuth access token.
- Added spreadsheet metadata validation for configured Sheet URL/ID.
- Added worksheet/tab existence checks.
- Added worksheet header loading from row 1.
- Added first 10 data rows as a preview table.
- Added required column checks based on the stored column mapping.
- Added campaign column mapping reads and upserts using
  `campaign_column_mappings`.
- Added column mapping controls on the campaign detail page.
- Added sheet validation status messages and worksheet list display.
- Kept Gmail sending, campaign execution, scheduling cron, template rendering,
  sequences, unsubscribe, and reply detection out of Phase 4.

## Changed Files

- `livesheet-campaigns/.env.example`
- `livesheet-campaigns/.gitignore`
- `livesheet-campaigns/README.md`
- `livesheet-campaigns/package-lock.json`
- `livesheet-campaigns/package.json`
- `livesheet-campaigns/scripts/generate-password-hash.mjs`
- `livesheet-campaigns/src/app/dashboard/page.tsx`
- `livesheet-campaigns/src/app/campaigns/CampaignForm.tsx`
- `livesheet-campaigns/src/app/campaigns/actions.ts`
- `livesheet-campaigns/src/app/campaigns/new/page.tsx`
- `livesheet-campaigns/src/app/campaigns/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/edit/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/sheet-actions.ts`
- `livesheet-campaigns/src/app/api/google/auth/callback/route.ts`
- `livesheet-campaigns/src/app/api/google/auth/start/route.ts`
- `livesheet-campaigns/src/app/api/google/disconnect/route.ts`
- `livesheet-campaigns/src/app/globals.css`
- `livesheet-campaigns/src/app/layout.tsx`
- `livesheet-campaigns/src/app/login/actions.ts`
- `livesheet-campaigns/src/app/login/page.tsx`
- `livesheet-campaigns/src/app/logout/route.ts`
- `livesheet-campaigns/src/app/page.tsx`
- `livesheet-campaigns/src/app/page.module.css` (removed starter styles)
- `livesheet-campaigns/src/lib/auth.ts`
- `livesheet-campaigns/src/lib/campaigns.ts`
- `livesheet-campaigns/src/lib/crypto/token-encryption.ts`
- `livesheet-campaigns/src/lib/dashboard-data.ts`
- `livesheet-campaigns/src/lib/env.ts`
- `livesheet-campaigns/src/lib/google/accounts.ts`
- `livesheet-campaigns/src/lib/google/oauth.ts`
- `livesheet-campaigns/src/lib/google/state.ts`
- `livesheet-campaigns/src/lib/sheets.ts`
- `livesheet-campaigns/src/lib/supabase/server.ts`
- `livesheet-campaigns/supabase/migrations/202604280001_initial_schema.sql`

## Setup Instructions

1. Go to the app directory:

```bash
cd livesheet-campaigns
```

2. Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

3. Generate and paste the password hash into `AUTH_PASSWORD_HASH`:

```bash
npm run auth:hash
```

4. Generate and paste an `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

5. Fill in Supabase URL and keys in `.env.local`.

Also fill in the Phase 2 Google OAuth and token encryption values:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/auth/callback
TOKEN_ENCRYPTION_KEY=
```

Generate `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

6. Apply `supabase/migrations/202604280001_initial_schema.sql` in Supabase.

7. Seed `app_settings`:

```sql
insert into public.app_settings (owner_email, global_daily_send_cap, timezone)
values ('you@example.com', 70, 'America/Chicago');
```

8. Start the app:

```bash
npm run dev
```

## Verification Steps

Run these from `livesheet-campaigns`:

```bash
npm run lint
npm run build
```

Verification completed in this phase:

- `npm run lint` passed on 2026-04-28 after Phase 4.
- `npm run build` passed on 2026-04-28 after Phase 4.
- `supabase db push` applied
  `supabase/migrations/202604280001_initial_schema.sql` to the hosted
  `livesheet-campaigns` Supabase project on 2026-04-28.
- Verified all expected tables are reachable through the service role client:
  `app_settings`, `google_accounts`, `campaigns`,
  `campaign_column_mappings`, `sequence_steps`, `send_history`,
  `campaign_runs`, `suppression_list`, `unsubscribe_events`, and
  `reply_events`.
- The production build used `.env.local`, compiled successfully with Next.js
  16.2.4 and Turbopack, completed TypeScript checks, generated all 12 static
  pages, and finalized route optimization.
- Verified app routes in the build output:
  `/`, `/_not-found`, `/api/google/auth/callback`,
  `/api/google/auth/start`, `/api/google/disconnect`, `/campaigns`,
  `/campaigns/[campaignId]`, `/campaigns/[campaignId]/edit`,
  `/campaigns/new`, `/dashboard`, `/login`, and `/logout`.

Manual checks after env and database setup:

- Visit `http://localhost:3000`.
- Confirm unauthenticated access redirects to `/login`.
- Sign in with the owner password used to generate `AUTH_PASSWORD_HASH`.
- Confirm `/dashboard` loads and shows setup/database status.
- Use `Connect Google` to start OAuth and confirm the connected Gmail address
  appears after callback.
- Visit `/campaigns`.
- Create a draft campaign with a Google Sheet URL and confirm the sheet ID is
  parsed on the campaign detail page.
- Edit the campaign and confirm updates persist.
- Confirm the campaign detail page validates the configured worksheet.
- Confirm worksheet headers load and missing required columns are reported.
- Save column mappings and confirm they persist after refresh.
- Confirm the first 10 data rows appear in the preview table.
- Use pause/resume and confirm the status changes.
- Delete the campaign and confirm it disappears from the list.
- Use `Disconnect` and confirm the connected account is removed.
- Use `Sign out` and confirm the session is cleared.

## Not Implemented Yet

- Gmail sending.
- Template rendering.
- Scheduler and cron routes.
- Live row detection and writeback.
- Unsubscribe and suppression workflows.
- Reply detection.

## Next Steps

Phase 5 should implement sequence/template management only after Phase 4 review
is complete.
