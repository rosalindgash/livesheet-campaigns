# LiveSheet Campaigns

Single-user Google Sheets and Gmail outreach sequencer. Phase 6 contains the
app foundation, Google OAuth connection, encrypted token storage, token refresh
handling, connected account display, disconnect, campaign CRUD, Google Sheets
validation, worksheet/header checks, row preview, column mapping, and
non-sending saved message template management with a basic HTML body editor and
preview rendering. It also includes owner-only Gmail test sends that render a
saved template against a selected Sheet preview row, apply unsubscribe-link
handling, check global suppression before sending, and persist test send history.

Campaign execution, scheduled sending, real prospect sending, Google Sheet
writeback, multi-touch sequence execution, reply detection, click/open tracking,
and public SaaS features are intentionally not implemented yet.

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
```

Generate `TOKEN_ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

6. Apply the database migration in `supabase/migrations/202604280001_initial_schema.sql`.
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
and global suppression records are enforced before test sends.

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
