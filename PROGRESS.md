# LiveSheet Campaigns Progress

## Phase 1 - Project Setup

Status: complete, copied into the app folder, and verified on 2026-04-28.

## Phase 2 - Google OAuth

Status: complete; smoke test passed.

## Phase 3 - Campaign CRUD

Status: complete; manual smoke test passed with dummy/test data.

## Phase 4 - Google Sheets Validation

Status: complete; manual smoke test passed.

## Phase 5 - Template Rendering Preview

Status: complete; manual smoke test passed.

## Phase 5.5 - Saved Message Templates

Status: complete and ready for review.

## Phase 5.6 - Basic HTML Body Editor

Status: complete and ready for review.

## Phase 6A - Minimal Unsubscribe Handling

Status: complete; manual unsubscribe smoke test passed.

## Phase 6 - Owner-Only Gmail Test Sends

Status: complete and ready for review.

## Phase 7 - Manual Campaign Runs

Status: complete and ready for review.

## Phase 8 - Scheduled Campaign Execution

Status: complete and ready for review.

## Phase 9 - Multi-Touch Sequence Execution

Status: complete and ready for review.

## Phase 10 - Suppression Audit and Admin

Status: complete and ready for review.

## Phase 11 - Gmail Reply Detection

Status: complete and ready for review.

## Phase 12 - Polish, Hardening, and Documentation

Status: complete; manual review passed for the personal-use MVP.

## 2026-05-04 Operational Fixes

Status: complete; deployed through GitHub/Vercel and Supabase migrations
applied.

## 2026-05-04 Automated Bounce Handling

Status: implemented locally and Supabase migration applied; GitHub push and
production verification pending in this work session.

- Added Phase 1 automated Gmail bounce polling through
  `/api/cron/process-bounces`.
- Added Gmail message search and full-message fetch helpers for inbox polling.
- The bounce poller searches likely Gmail delivery-failure notices from
  Mail Delivery Subsystem, mailer-daemon, postmaster, and common delivery
  failure subject lines.
- Added conservative bounce parsing for failed recipient email, reason,
  diagnostic code, enhanced SMTP/status code, original message ID, and Gmail
  source message ID.
- Added recipient matching through recent `send_history` rows because contacts
  are represented by connected Sheet rows plus send history in the current app
  architecture.
- Added high-confidence auto-suppression for permanent failures only when a
  single failed recipient can be matched to an existing campaign send.
- Low-confidence bounces are recorded as `manual_review` instead of suppressing
  the recipient.
- High-confidence bounces upsert `suppression_list.reason = bounce`, mark the
  matched `send_history` row as `bounced`, and write `status = bounced` plus an
  error message back to the connected Sheet when row metadata is available.
- Added `bounce_events` to store recipient email, campaign ID, send history ID,
  reason, raw Gmail source message ID, Gmail thread ID, status code,
  diagnostic code, confidence, action, metadata, and timestamps.
- Added a unique index on `bounce_events.raw_source_message_id` so the same
  Gmail bounce notice is not processed twice.
- Added an admin-visible Recent bounces table to `/admin/suppressions`.
- Added an hourly Vercel Cron entry for `/api/cron/process-bounces`.
- Verified locally with `npm run lint` and `npm run build`.

## 2026-05-04 Completed Work

- Investigated why the active `Scholium Outreach` campaign did not run at the
  scheduled time. Verified the campaign row was active, configured for
  `MON-FRI` at `07:00` America/Chicago, due at the current campaign-local
  time, and had no existing scheduled or manual `campaign_runs`.
- Identified that the scheduler endpoint existed but there was no production
  cron registration file, so the route was not being invoked automatically.
- Added `vercel.json` with Vercel Cron entries for
  `/api/cron/run-due-campaigns` and `/api/cron/check-replies`.
- Confirmed the cron auth route accepts Vercel's
  `Authorization: Bearer <CRON_SECRET>` header format and still supports
  `x-cron-secret` for local/manual calls.
- Added Vercel-visible log lines to `/api/cron/run-due-campaigns` for accepted,
  rejected, and completed cron requests.
- Fixed daily cap accounting to count only real campaign sends
  (`send_type = campaign`) and to use campaign/app timezone day boundaries
  rather than the server's local day.
- Confirmed the first Vercel redeploy failed because the initial cron
  schedules (`*/15` and `*/30`) exceeded the current Vercel plan's cron
  frequency limits.
- Changed Vercel cron schedules to once-per-weekday:
  `/api/cron/run-due-campaigns` at `0 13 * * 1-5` and
  `/api/cron/check-replies` at `0 14 * * 1-5`.
- Added campaign-level per-touch daily cap fields:
  `touch_1_daily_cap`, `touch_2_daily_cap`, and `touch_3_daily_cap`.
- Updated campaign create/edit settings so per-touch caps are explicit
  campaign options rather than hard-coded runner constants.
- Updated the campaign runner to bucket eligible rows by sequence step and
  apply each campaign's saved per-touch caps before sending.
- Preserved the overall campaign daily cap and global daily cap as safety
  ceilings above the per-touch caps.
- Ensured unused Touch 2 or Touch 3 capacity does not roll into Touch 1.
- Added manual-run enforcement of campaign selected send days, so `Run now`
  will not start on a day not selected in the campaign day picker.
- Updated the manual-run UI message for non-send-day manual run attempts.
- Changed the default Touch 2 delay for newly generated default sequence
  settings from 4 to 5 calendar days. The send-day picker remains the source of
  truth for whether a due follow-up can actually send on a given day.
- Verified the existing `Scholium Outreach` sequence already had Touch 2 delay
  set to 5.
- Applied Supabase migration
  `202605040001_campaign_step_daily_caps.sql` to the hosted project.
- Applied Supabase migration
  `202605040002_drop_campaign_step_cap_defaults.sql` to remove database
  defaults for future campaign touch caps; future campaigns must set these
  values explicitly in campaign settings.
- Confirmed the existing `Scholium Outreach` campaign retained saved caps:
  total daily cap 40, Touch 1 cap 20, Touch 2 cap 20, and Touch 3 cap 0.
- Pushed commits:
  `b2cdf8f Fix scheduled campaign cron execution`,
  `1600499 Use Vercel-compatible cron schedules`,
  `ea2d8d8 Add per-touch campaign send caps`, and
  `c39970b Require explicit touch cap settings`.
- Confirmed Vercel redeploys succeeded after the compatible cron and
  per-touch-cap commits.

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

## Phase 5 Completed Work

- Added a safe no-eval template renderer for row-value variable substitution.
- Added support for `{{variable}}` placeholders using exact and normalized
  Google Sheet header names.
- Added support for conditional blocks:
  `{{#if e_transcript}}...{{else}}...{{/if}}`.
- Added missing-column warnings when a template references a column that is not
  present in the selected Sheet preview row context.
- Added a client-side non-sending template preview panel on campaign detail
  pages.
- Added row selection from the first 10 loaded Sheet preview rows.
- Added rendered subject and rendered body previews.
- Kept Gmail sending, campaign execution, scheduling cron, sequences,
  unsubscribe, status writeback, and reply detection out of Phase 5.

## Phase 5.5 Completed Work

- Added saved campaign-level message template management using the existing
  `sequence_steps` table.
- Added a sequence-step model/helper for steps 1, 2, and 3 only.
- Added save and delete server actions for saved message templates.
- Added default stage and delay values for Touch 1, Touch 2, and Touch 3.
- Added campaign detail UI to create, edit, delete, and mark templates
  active/inactive.
- Added fields for `step_number`, `name`, `subject_template`, `body_template`,
  `delay_days_after_previous_step`, `stage_required`, `stage_after_send`, and
  `is_active`.
- Added per-template non-sending preview using the existing Sheet row template
  renderer.
- Added missing-column warnings for each saved template preview.
- Kept Gmail sending, campaign execution, scheduled sending, status writeback,
  unsubscribe endpoint, suppression logic, and reply detection out of
  Phase 5.5.

## Phase 5.6 Completed Work

- Replaced saved message body template textareas with a lightweight WYSIWYG
  editor while keeping subject templates as single-line plain text.
- Added body editor support for paragraphs, line breaks, bold, italic,
  bulleted lists, numbered lists, and hyperlinks.
- Added toolbar controls for bold, italic, bulleted list, numbered list,
  add/edit link, remove link, undo, and redo.
- Added the unsubscribe placeholder note near the body editor.
- Added sanitization for saved and rendered HTML with an allowlist of `p`,
  `br`, `strong`, `b`, `em`, `i`, `ul`, `ol`, `li`, and `a`.
- Restricted link attributes to `href`, `target`, and `rel`, and force rendered
  links to `target="_blank"` and `rel="noopener noreferrer"`.
- Updated saved-template previews to render processed HTML safely after
  variable substitution and conditional rendering.
- Kept Gmail sending, campaign execution, scheduled sending, status writeback,
  unsubscribe endpoint, suppression logic, and reply detection out of this
  editor upgrade.

## Phase 6A Completed Work

- Added `send_history.unsubscribe_token` with a secure database default and
  unique index.
- Added unsubscribe URL helpers and secure app-side token generation helper for
  future send creation.
- Added rendered body handling that fills `{{unsubscribe_url}}` when present.
- Added automatic simple unsubscribe footer insertion when the template omits
  `{{unsubscribe_url}}`.
- Added `GET /unsubscribe/[token]` confirmation page.
- Added `POST /api/unsubscribe/[token]` confirmation endpoint.
- On confirmed unsubscribe, the app creates/upserts an `unsubscribe_events`
  record, adds the recipient email to `suppression_list` with
  `reason = unsubscribed`, associates `campaign_id` when available, and marks
  the related `send_history` record as `unsubscribed`.
- Added suppression-check helper for future Gmail send code so suppressed
  recipients return a clear skipped status before any send.
- Kept Gmail sending, campaign execution, scheduled sending, Google Sheet
  writeback, reply detection, click/open tracking, and public SaaS features out
  of Phase 6A.

## Phase 6 Completed Work

- Added Gmail API sending through the connected Google account using the stored
  OAuth token with a forced refresh retry on Gmail auth failures.
- Added an owner-only test-send flow on each saved message template card.
- Test sends render a selected saved template against a selected Google Sheet
  preview row, but send only to `APP_OWNER_EMAIL` or an explicitly confirmed
  owner-controlled test inbox.
- Added guardrails so the test-send flow never uses Sheet recipient emails as
  Gmail recipients.
- Added global suppression checks before any Gmail test send. Suppressed
  recipients are not sent to and are recorded as skipped.
- Integrated existing unsubscribe rendering helpers so `{{unsubscribe_url}}` is
  filled when present, or a simple unsubscribe footer is appended when omitted.
- Added `send_history.send_type` with a `test` marker for owner test sends.
- Persisted test send history with campaign ID, sequence step ID, test marker,
  recipient snapshot, rendered subject/body, unsubscribe token, Gmail message
  ID/thread ID when sent, status, timestamps, and failure/skipped messages.
- Kept campaign execution, scheduled sending, live row status writeback,
  multi-touch sequence execution, cron, reply detection, click/open tracking,
  and real prospect sending out of Phase 6.

## Phase 7 Completed Work

- Added manual campaign execution from a guarded `Run now` button on the
  campaign detail page.
- Added a required confirmation checkbox and warning that manual runs send real
  email to eligible Google Sheet rows.
- Manual runs read the connected Google Sheet fresh every time they start.
- Implemented Touch 1 only using the active saved Step 1 template.
- Added live row eligibility checks for valid email, row status/stage, paused
  rows, unsubscribed rows, and replied rows.
- Added global suppression checks during processing so suppressed recipients are
  skipped without Gmail sending.
- Enforced campaign daily send caps and global daily send caps before
  processing rows.
- Implemented revised cap behavior: over-cap eligible rows are not attempted,
  do not receive `send_history` rows, and are not written back to the Sheet.
- Added campaign-run-level cap tracking with `emails_selected_for_run`,
  `eligible_not_processed_due_to_cap`, and `cap_limited`.
- Added real campaign `send_history` persistence for selected rows that are
  sent, skipped during processing, or failed.
- Added Google Sheet writeback for successful sends:
  `status = touch_1_sent`, `stage = touch_1_sent`, `last_sent_at`,
  `last_touch_sent = 1`, and blank `error_message`.
- Added Google Sheet writeback for failed sends:
  `status = error` and a short `error_message`.
- Added `campaign_runs` creation and completion updates for manual runs,
  including rows scanned, eligible rows found, selected rows, sent/skipped
  counts, errors, cap limitation, and summaries.
- Kept scheduled sending, cron, multi-touch follow-up execution, reply
  detection, click/open tracking, public SaaS features, and automated prospect
  scheduling out of Phase 7.

## Phase 8 Completed Work

- Added `POST /api/cron/run-due-campaigns`.
- Protected the cron endpoint with `CRON_SECRET` using a bearer token or
  `x-cron-secret` header.
- Added scheduler logic that fetches active campaigns only.
- Converted the current time to each campaign timezone using the campaign's
  saved timezone.
- Checked saved send days and send time before starting scheduled runs.
- Added dry-run scheduler support with optional `now` override for local due
  logic testing without sending email.
- Reused the Phase 7 campaign runner for scheduled runs instead of duplicating
  campaign execution, cap enforcement, suppression checks, Gmail sending, Sheet
  writeback, and run logging.
- Refactored the campaign runner to support `run_type = manual` and
  `run_type = scheduled` while keeping manual `Run now` behavior unchanged.
- Added `campaign_runs.scheduled_date` plus a unique scheduled-run index so a
  campaign cannot start more than one scheduled run for the same campaign-local
  date.
- Added scheduler checks that skip campaigns already run or already in progress
  for the scheduled date.
- Added campaign detail schedule status showing schedule, current campaign
  local date/time, due reason, and last scheduled run.
- Updated README cron setup and `CRON_SECRET` usage documentation.
- Kept multi-touch follow-up execution, reply detection, click/open tracking,
  public SaaS features, billing, teams, and real prospect sending without
  sandbox testing out of Phase 8.

## Phase 9 Completed Work

- Extended the shared campaign runner used by manual and scheduled runs to
  support active saved sequence steps 1, 2, and 3.
- Added fresh-Sheet row selection that chooses one appropriate touch per row
  based on row stage and never sends multiple touches to the same row in one
  run.
- Kept Step 1 eligibility for rows with blank/new stage and blank/new/active
  status.
- Added Step 2 eligibility for rows staged `touch_1_sent` whose `last_sent_at`
  is at least the active Step 2 delay days old.
- Added Step 3 eligibility for rows staged `touch_2_sent` whose `last_sent_at`
  is at least the active Step 3 delay days old.
- Excluded invalid emails, paused rows, replied rows, unsubscribed rows, and
  suppressed emails from eligibility.
- Kept a second suppression check immediately before Gmail sending so a newly
  suppressed selected recipient is skipped without sending.
- Used the correct saved subject/body template for the selected sequence step,
  including existing variable, conditional, HTML normalization, and unsubscribe
  rendering behavior.
- Updated successful Sheet writeback for Step 1, Step 2, and Step 3, including
  status, stage, `last_sent_at`, `last_touch_sent`, and blank
  `error_message`.
- Preserved Phase 7/8 cap behavior across all touches: over-cap eligible rows
  are not attempted, do not receive `send_history`, and are not written back to
  the Sheet.
- Added `campaign_runs.run_metadata` with per-step selected, sent, skipped, and
  failed counters.
- Added per-step run summaries to `campaign_runs.error_summary` for quick
  inspection.
- Kept reply detection, click/open tracking, public SaaS features, billing,
  teams, AI writing, and CRM features out of Phase 9.

## Phase 10 Completed Work

- Reviewed unsubscribe and suppression coverage after Phase 9.
- Confirmed the unsubscribe page and confirmation endpoint are still present
  and unchanged after Phase 9.
- Confirmed campaign runs check `suppression_list` during eligibility and again
  immediately before Gmail sending, covering Step 1, Step 2, and Step 3.
- Added an owner-only `/admin/suppressions` page.
- Added manual suppression creation/upsert with email, reason, optional
  campaign association, and notes.
- Added suppression removal from the admin page.
- Added a suppression-list table showing email, reason, campaign, source,
  notes, and created date.
- Added a recent unsubscribe-events table showing recipient email, campaign,
  confirmation time, shortened token, and user agent.
- Added navigation links to suppression admin from the dashboard, campaign list,
  and campaign detail page.
- Added `dev-server*.log` to `.gitignore` for local development logs.
- Kept reply detection, click/open tracking, public SaaS features, billing,
  teams, AI writing, and broader CRM features out of Phase 10.

## Phase 11 Completed Work

- Added Gmail thread fetching support using the connected Google account.
- Added `POST /api/cron/check-replies`, protected by `CRON_SECRET`.
- Added `dryRun=1` support for reply checks so eligible threads can be
  inspected without writing changes.
- Added reply detection for campaign `send_history` rows with `send_type =
  campaign`, `status = sent`, Gmail thread IDs, and no existing reply event.
- Inspected Gmail thread messages after the sent campaign message.
- Detected replies from the recipient email and ignored messages from the
  connected sender Gmail account.
- Added basic auto-reply filtering for automatic replies, out-of-office
  subjects, auto-submitted headers, precedence bulk/list, and list headers.
- Added idempotency protection for reply events by send/thread/recipient.
- Recorded reply detections in `reply_events`.
- Marked related `send_history` rows as `reply_detected`.
- Attempted Google Sheet writeback for detected replies:
  `status = replied`, `replied_at = reply timestamp`, and blank
  `error_message`.
- Preserved reply events when Sheet writeback fails.
- Updated campaign run eligibility to skip recipients already present in
  `reply_events` so detected replies stop future touches even if Sheet
  writeback fails.
- Added a simple campaign-detail reply indicator with reply count, latest
  reply timestamp, and recent reply chips.
- Kept click/open tracking, CRM features, public SaaS features, billing, teams,
  and AI writing out of Phase 11.

## Phase 12 Completed Work

- Refined the global visual system toward a cleaner operational SaaS style:
  lighter neutral background, white panels, restrained green accent, tighter
  shadows, smaller radius, and compact spacing.
- Removed viewport-scaled and negative-letter-spaced display sizing from the
  main headings and metrics.
- Reduced bulky panel padding and table row spacing across the app.
- Added campaign-detail section jump links for Overview, Sheet, Sequence,
  Sending, and Logs.
- Moved campaign lifecycle actions near the top of the campaign detail page.
- Highlighted manual run controls as a guarded sending area while preserving
  the explicit confirmation checkbox and warning.
- Made campaign detail overview/run panels more compact.
- Improved dashboard campaign summaries with schedule and last-run details.
- Added a View quick action to the campaign list and tightened table scanning.
- Made suppression admin forms/tables more compact and consistent.
- Updated README with a local setup checklist, environment variable
  descriptions, Google OAuth setup summary, safe testing guidance, cron usage,
  reply-detection usage, and deployment notes.
- Reviewed safety guardrails: manual runs still require confirmation, cron
  endpoints still require `CRON_SECRET`, dry-run endpoints do not send/write,
  suppression checks still occur before sending, replied recipients remain
  skipped, and over-cap rows remain untouched.
- Kept billing, teams, public SaaS onboarding, click/open tracking, AI writing,
  CRM pipeline features, Airtable, Notion, and major new product features out
  of Phase 12.

## Changed Files

- `livesheet-campaigns/.env.example`
- `livesheet-campaigns/.gitignore`
- `livesheet-campaigns/README.md`
- `livesheet-campaigns/package-lock.json`
- `livesheet-campaigns/package.json`
- `livesheet-campaigns/package-lock.json`
- `livesheet-campaigns/package.json`
- `livesheet-campaigns/scripts/generate-password-hash.mjs`
- `livesheet-campaigns/src/app/admin/suppressions/actions.ts`
- `livesheet-campaigns/src/app/admin/suppressions/page.tsx`
- `livesheet-campaigns/src/app/dashboard/page.tsx`
- `livesheet-campaigns/src/app/campaigns/CampaignForm.tsx`
- `livesheet-campaigns/src/app/campaigns/actions.ts`
- `livesheet-campaigns/src/app/campaigns/new/page.tsx`
- `livesheet-campaigns/src/app/campaigns/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/edit/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/page.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/BodyTemplateEditor.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/SequenceTemplatePreview.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/TemplatePreview.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/sequence-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/run-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/sheet-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/test-send-actions.ts`
- `livesheet-campaigns/src/app/api/cron/run-due-campaigns/route.ts`
- `livesheet-campaigns/src/app/api/cron/check-replies/route.ts`
- `livesheet-campaigns/src/app/api/google/auth/callback/route.ts`
- `livesheet-campaigns/src/app/api/google/auth/start/route.ts`
- `livesheet-campaigns/src/app/api/google/disconnect/route.ts`
- `livesheet-campaigns/src/app/api/unsubscribe/[token]/route.ts`
- `livesheet-campaigns/src/app/unsubscribe/[token]/page.tsx`
- `livesheet-campaigns/src/app/globals.css`
- `livesheet-campaigns/src/app/layout.tsx`
- `livesheet-campaigns/src/app/login/actions.ts`
- `livesheet-campaigns/src/app/login/page.tsx`
- `livesheet-campaigns/src/app/logout/route.ts`
- `livesheet-campaigns/src/app/page.tsx`
- `livesheet-campaigns/src/app/page.module.css` (removed starter styles)
- `livesheet-campaigns/src/lib/auth.ts`
- `livesheet-campaigns/src/lib/campaign-runner.ts`
- `livesheet-campaigns/src/lib/campaigns.ts`
- `livesheet-campaigns/src/lib/cron-auth.ts`
- `livesheet-campaigns/src/lib/crypto/token-encryption.ts`
- `livesheet-campaigns/src/lib/dashboard-data.ts`
- `livesheet-campaigns/src/lib/env.ts`
- `livesheet-campaigns/src/lib/google/accounts.ts`
- `livesheet-campaigns/src/lib/google/gmail.ts`
- `livesheet-campaigns/src/lib/google/oauth.ts`
- `livesheet-campaigns/src/lib/google/state.ts`
- `livesheet-campaigns/src/lib/html-sanitizer.ts`
- `livesheet-campaigns/src/lib/reply-detection.ts`
- `livesheet-campaigns/src/lib/sheets.ts`
- `livesheet-campaigns/src/lib/scheduler.ts`
- `livesheet-campaigns/src/lib/sequence-steps.ts`
- `livesheet-campaigns/src/lib/suppression-admin.ts`
- `livesheet-campaigns/src/lib/supabase/server.ts`
- `livesheet-campaigns/src/lib/templates.ts`
- `livesheet-campaigns/src/lib/unsubscribe.ts`
- `livesheet-campaigns/supabase/migrations/202604280001_initial_schema.sql`
- `livesheet-campaigns/supabase/migrations/202604290001_unsubscribe_tokens.sql`
- `livesheet-campaigns/supabase/migrations/202604290002_send_history_test_marker.sql`
- `livesheet-campaigns/supabase/migrations/202604290003_campaign_run_cap_tracking.sql`
- `livesheet-campaigns/supabase/migrations/202604300001_scheduled_campaign_runs.sql`
- `livesheet-campaigns/supabase/migrations/202604300002_campaign_run_step_metadata.sql`
- `livesheet-campaigns/supabase/migrations/202604300003_reply_detection_idempotency.sql`

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

- `npm run lint` passed on 2026-04-29 after Phase 6A.
- `npm run build` passed on 2026-04-29 after Phase 6A.
- `npm run lint` passed on 2026-04-29 after Phase 6.
- `npm run build` passed on 2026-04-29 after Phase 6.
- `npm run lint` passed on 2026-04-29 after Phase 7.
- `npm run build` passed on 2026-04-29 after Phase 7.
- `npm run lint` passed on 2026-04-30 after Phase 8.
- `npm run build` passed on 2026-04-30 after Phase 8.
- `supabase db push` applied
  `supabase/migrations/202604300001_scheduled_campaign_runs.sql` to the
  hosted `livesheet-campaigns` Supabase project on 2026-04-30.
- Verified `campaign_runs.scheduled_date` is reachable through the service
  role client.
- Verified `POST /api/cron/run-due-campaigns?dryRun=1` rejects missing cron
  authentication with `401`.
- Verified `POST /api/cron/run-due-campaigns?dryRun=1` returns a dry-run JSON
  response with valid `CRON_SECRET` and does not send email. The Demo campaign
  was paused during this check, so no active campaigns were evaluated.
- Manual Phase 8 scheduler test passed on 2026-04-30 using the Demo campaign
  and a sandbox owner-controlled Sheet only: dry-run reported due, one real
  scheduled run sent and wrote back two eligible rows, `campaign_runs` recorded
  `run_type = scheduled`, and a repeat cron request skipped the already
  completed scheduled date without duplicate sending.
- `npm run lint` passed on 2026-04-30 after Phase 9.
- `npm run build` passed on 2026-04-30 after Phase 9.
- `supabase db push` applied
  `supabase/migrations/202604300002_campaign_run_step_metadata.sql` to the
  hosted `livesheet-campaigns` Supabase project on 2026-04-30.
- Verified `campaign_runs.run_metadata` is reachable through the service role
  client.
- Manual Phase 9 multi-touch test passed on 2026-04-30 using the Demo campaign
  and a sandbox owner-controlled Sheet only. The manual run panel processed the
  eligible Step 1 and Step 2 rows, skipped blocked rows, wrote back the
  expected Sheet statuses/stages, and recorded per-step run metadata.
- `npm run lint` passed on 2026-04-30 after Phase 10.
- `npm run build` passed on 2026-04-30 after Phase 10 and included
  `/admin/suppressions` in the route output.
- Verified a temporary `manual_suppression` row can be inserted into and
  removed from `suppression_list` using `source = manual_admin`.
- Manual Phase 10 suppression admin tests passed on 2026-04-30.
- `npm run lint` passed on 2026-04-30 after Phase 11.
- `npm run build` passed on 2026-04-30 after Phase 11 and included
  `/api/cron/check-replies` in the route output.
- `supabase db push` applied
  `supabase/migrations/202604300003_reply_detection_idempotency.sql` to the
  hosted `livesheet-campaigns` Supabase project on 2026-04-30.
- Verified `reply_events` is reachable through the service role client.
- Verified `POST /api/cron/check-replies?dryRun=1` rejects missing cron
  authentication with `401`.
- Verified `POST /api/cron/check-replies?dryRun=1` returns a dry-run JSON
  response with valid `CRON_SECRET`; the dry run checked 7 eligible campaign
  sends and made no writes.
- Manual Phase 11 tests passed on 2026-04-30, including dry run, real run,
  Sheet writeback, `send_history` update, `reply_events` insert, duplicate
  protection, and follow-up skip behavior.
- `npm run lint` passed on 2026-04-30 after Phase 12.
- `npm run build` passed on 2026-04-30 after Phase 12.
- Verified `POST /api/cron/run-due-campaigns?dryRun=1` still rejects missing
  cron authentication with `401`.
- Verified authenticated scheduled-run dry run still returns JSON without
  sending email.
- Verified authenticated reply-detection dry run still returns JSON without
  writing changes.
- Manual Phase 12 review passed on 2026-04-30 for the personal-use MVP.
- Added `SAAS_UI_REDESIGN.md` to track the future paid-SaaS-grade UI redesign
  need.
- `npm run lint` passed on 2026-05-04 after the scheduled-campaign cron fix,
  daily-cap timezone fix, per-touch campaign cap implementation, and explicit
  touch-cap setting cleanup.
- `npx tsc --noEmit` passed on 2026-05-04 after the scheduled-campaign cron
  fix, daily-cap timezone fix, per-touch campaign cap implementation, and
  explicit touch-cap setting cleanup.
- `supabase db push` applied
  `supabase/migrations/202605040001_campaign_step_daily_caps.sql` to the
  hosted `livesheet-campaigns` Supabase project on 2026-05-04.
- `supabase db push` applied
  `supabase/migrations/202605040002_drop_campaign_step_cap_defaults.sql` to
  the hosted `livesheet-campaigns` Supabase project on 2026-05-04.
- Verified `Scholium Outreach` has `daily_send_cap = 40`,
  `touch_1_daily_cap = 20`, `touch_2_daily_cap = 20`, and
  `touch_3_daily_cap = 0`.
- `supabase db push` applied
  `supabase/migrations/202604290001_unsubscribe_tokens.sql` to the hosted
  `livesheet-campaigns` Supabase project on 2026-04-29.
- `supabase db push` applied
  `supabase/migrations/202604290002_send_history_test_marker.sql` to the hosted
  `livesheet-campaigns` Supabase project on 2026-04-29.
- Verified `send_history.send_type` is reachable through the service role
  client.
- `supabase db push` applied
  `supabase/migrations/202604290003_campaign_run_cap_tracking.sql` to the
  hosted `livesheet-campaigns` Supabase project on 2026-04-29.
- Verified the new `campaign_runs` cap-tracking columns are reachable through
  the service role client.
- `supabase db push` applied
  `supabase/migrations/202604280001_initial_schema.sql` to the hosted
  `livesheet-campaigns` Supabase project on 2026-04-28.
- Verified all expected tables are reachable through the service role client:
  `app_settings`, `google_accounts`, `campaigns`,
  `campaign_column_mappings`, `sequence_steps`, `send_history`,
  `campaign_runs`, `suppression_list`, `unsubscribe_events`, and
  `reply_events`.
- The production build used `.env.local`, compiled successfully with Next.js
  16.2.4 and Turbopack, completed TypeScript checks, generated all static
  pages, and finalized route optimization.
- Verified app routes in the build output:
  `/`, `/_not-found`, `/api/cron/run-due-campaigns`, `/api/google/auth/callback`,
  `/api/google/auth/start`, `/api/google/disconnect`,
  `/api/unsubscribe/[token]`, `/campaigns`, `/campaigns/[campaignId]`,
  `/campaigns/[campaignId]/edit`, `/campaigns/new`, `/dashboard`, `/login`,
  `/logout`, and `/unsubscribe/[token]`.
- Manual Phase 6A unsubscribe test passed on 2026-04-29:
  created a test `send_history` row with an unsubscribe token, visited the
  unsubscribe URL, confirmed unsubscribe, verified `unsubscribe_events` and
  `suppression_list`, verified the related `send_history.status` changed to
  `unsubscribed`, and confirmed suppression lookup returns a skipped status for
  the suppressed recipient.

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
- Select a row in the template preview panel.
- Render a subject/body with `{{first_name}}` and other Sheet variables.
- Test a conditional block such as
  `{{#if e_transcript}}Has e-transcript{{else}}No e-transcript{{/if}}`.
- Reference a missing column and confirm a warning appears.
- Create or edit saved message templates for steps 1, 2, and 3.
- Confirm default stage and delay values match the expected touch defaults.
- Mark a template inactive and confirm the status pill changes.
- Delete a saved template and confirm the default empty touch slot returns.
- Preview each saved template against a selected Sheet row and confirm
  missing-column warnings still work.
- Format a saved body template with paragraphs, bold, italic, bullets,
  numbered lists, and links.
- Confirm saved/rendered HTML remains basic and links open with safe target/rel
  behavior.
- Confirm `{{unsubscribe_url}}` renders as an unsubscribe URL in preview/test
  render helpers.
- Confirm templates without `{{unsubscribe_url}}` receive a simple unsubscribe
  footer in preview/test render helpers.
- Visit a valid unsubscribe token URL, confirm unsubscribe, and verify
  `unsubscribe_events`, `suppression_list`, and related `send_history` status.
- Send a test email from a saved template to `APP_OWNER_EMAIL`.
- Confirm the delivered email uses the selected Sheet preview row values.
- Confirm the delivered email includes either the rendered `{{unsubscribe_url}}`
  or the automatic unsubscribe footer.
- Confirm Supabase records the test send in `send_history` with
  `send_type = test`, status `sent`, rendered subject/body, recipient snapshot,
  unsubscribe token, Gmail message ID, and Gmail thread ID.
- Send a test to a suppressed test address and confirm no Gmail email is sent
  and `send_history.status = skipped`.
- Enter a non-owner test recipient without checking the owner-controlled
  confirmation box and confirm the app blocks the send.
- Prepare a sandbox Sheet with only owner-controlled email addresses.
- Configure an active Step 1 saved template.
- Confirm the campaign detail page shows the `Run now` manual-run panel.
- Try `Run now` without checking the confirmation box and confirm the app
  blocks the run.
- Check the confirmation box and run the campaign manually.
- Confirm only eligible Touch 1 rows are processed.
- Confirm successful sends create `send_history` rows with `send_type =
  campaign`.
- Confirm successful sends write back `touch_1_sent`, `last_sent_at`,
  `last_touch_sent = 1`, and a blank `error_message` to the Sheet.
- Confirm suppressed selected rows create skipped `send_history` rows and do
  not send email.
- Confirm failed sends create failed `send_history` rows and write Sheet
  `status = error` plus an error message.
- Set campaign/global caps below the eligible row count and confirm over-cap
  rows receive no `send_history` row and no Sheet writeback.
- Confirm `campaign_runs` logs rows scanned, eligible rows found, selected row
  count, over-cap count, cap-limited state, sent/skipped/error counts, and run
  status.
- Use pause/resume and confirm the status changes.
- Confirm active campaigns show schedule details on the campaign detail page,
  including current campaign-local time and last scheduled run.
- Call `POST /api/cron/run-due-campaigns?dryRun=1` with the `CRON_SECRET`
  bearer token and confirm the response reports due/not-due status without
  sending email.
- Optionally call the dry-run endpoint with a `now` query value that matches
  the Demo campaign's saved send day/time and confirm it reports the Demo
  campaign as due without sending email.
- For an actual scheduled-send smoke test, use only the Demo campaign connected
  to a sandbox Sheet with owner-controlled email addresses, set the campaign to
  active, set `send_time` to the current campaign-local time, and call the cron
  endpoint without `dryRun=1`.
- Confirm the scheduled run creates `campaign_runs.run_type = scheduled`.
- Confirm repeated cron calls for the same campaign-local date do not send a
  duplicate scheduled run.
- In the Demo sandbox Sheet, prepare owner-controlled rows for Step 1, Step 2,
  and Step 3.
- For Step 1, use a valid owner-controlled email with blank/new status and
  blank/new stage.
- For Step 2, use stage `touch_1_sent`, a valid old `last_sent_at` timestamp
  older than the Step 2 delay, and an active saved Step 2 template.
- For Step 3, use stage `touch_2_sent`, a valid old `last_sent_at` timestamp
  older than the Step 3 delay, and an active saved Step 3 template.
- Add rows with `replied_at`, `unsubscribed_at`, invalid email, and paused
  status and confirm they are not selected.
- Run the campaign manually or through the scheduler using only the Demo
  sandbox Sheet.
- Confirm each eligible row receives only one touch in that run.
- Confirm Step 1 writeback uses `status = touch_1_sent`, `stage =
  touch_1_sent`, and `last_touch_sent = 1`.
- Confirm Step 2 writeback uses `status = touch_2_sent`, `stage =
  touch_2_sent`, and `last_touch_sent = 2`.
- Confirm Step 3 writeback uses `status = touch_3_sent`, `stage = completed`,
  and `last_touch_sent = 3`.
- Confirm `send_history.sequence_step_id` matches the saved template used for
  each sent touch.
- Confirm `campaign_runs.run_metadata.stepStats` reports selected/sent counts
  for Steps 1, 2, and 3.
- Send a campaign email from Demo to an owner-controlled recipient.
- Reply from that recipient inbox.
- Call `POST /api/cron/check-replies?dryRun=1` with `CRON_SECRET` and confirm
  the response reports the pending detection without writing changes.
- Call `POST /api/cron/check-replies` with `CRON_SECRET`.
- Confirm `reply_events` has the reply with campaign ID, send history ID,
  recipient email, Gmail thread/message IDs, timestamp, subject, and snippet.
- Confirm the related `send_history.status` changes to `reply_detected`.
- Confirm the source Sheet row gets `status = replied`, `replied_at` filled,
  and blank `error_message`.
- Confirm the campaign detail page shows the detected reply count/latest reply.
- Confirm a future campaign run skips the replied row.
- Delete the campaign and confirm it disappears from the list.
- Use `Disconnect` and confirm the connected account is removed.
- Use `Sign out` and confirm the session is cleared.

## Not Implemented Yet

- Automated prospect Gmail sending outside guarded manual runs.
- Click/open tracking.
- CRM features.

## Next Steps

Phase 12 should be scoped after Phase 11 review.
