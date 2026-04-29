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

## Changed Files

- `livesheet-campaigns/.env.example`
- `livesheet-campaigns/.gitignore`
- `livesheet-campaigns/README.md`
- `livesheet-campaigns/package-lock.json`
- `livesheet-campaigns/package.json`
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
- `livesheet-campaigns/src/app/campaigns/[campaignId]/BodyTemplateEditor.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/SequenceTemplatePreview.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/TemplatePreview.tsx`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/sequence-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/run-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/sheet-actions.ts`
- `livesheet-campaigns/src/app/campaigns/[campaignId]/test-send-actions.ts`
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
- `livesheet-campaigns/src/lib/crypto/token-encryption.ts`
- `livesheet-campaigns/src/lib/dashboard-data.ts`
- `livesheet-campaigns/src/lib/env.ts`
- `livesheet-campaigns/src/lib/google/accounts.ts`
- `livesheet-campaigns/src/lib/google/gmail.ts`
- `livesheet-campaigns/src/lib/google/oauth.ts`
- `livesheet-campaigns/src/lib/google/state.ts`
- `livesheet-campaigns/src/lib/html-sanitizer.ts`
- `livesheet-campaigns/src/lib/sheets.ts`
- `livesheet-campaigns/src/lib/sequence-steps.ts`
- `livesheet-campaigns/src/lib/supabase/server.ts`
- `livesheet-campaigns/src/lib/templates.ts`
- `livesheet-campaigns/src/lib/unsubscribe.ts`
- `livesheet-campaigns/supabase/migrations/202604280001_initial_schema.sql`
- `livesheet-campaigns/supabase/migrations/202604290001_unsubscribe_tokens.sql`
- `livesheet-campaigns/supabase/migrations/202604290002_send_history_test_marker.sql`
- `livesheet-campaigns/supabase/migrations/202604290003_campaign_run_cap_tracking.sql`

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
  16.2.4 and Turbopack, completed TypeScript checks, generated all 12 static
  pages, and finalized route optimization.
- Verified app routes in the build output:
  `/`, `/_not-found`, `/api/google/auth/callback`,
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
- Delete the campaign and confirm it disappears from the list.
- Use `Disconnect` and confirm the connected account is removed.
- Use `Sign out` and confirm the session is cleared.

## Not Implemented Yet

- Automated prospect Gmail sending outside guarded manual runs.
- Scheduler and cron routes.
- Scheduled campaign execution.
- Follow-up execution logic.
- Reply detection.
- Click/open tracking.

## Next Steps

Phase 7 should implement controlled campaign execution only after Phase 6 review
is complete.
