create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  global_daily_send_cap integer not null default 70 check (global_daily_send_cap > 0),
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  scope text not null,
  token_expiry timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  google_account_id uuid references public.google_accounts(id) on delete set null,
  sheet_id text,
  sheet_url text,
  worksheet_name text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'error')),
  daily_send_cap integer not null default 40 check (daily_send_cap > 0),
  timezone text not null default 'America/Chicago',
  send_time time not null default '07:00',
  send_days jsonb not null default '["MON", "TUE", "WED", "THU", "FRI"]'::jsonb,
  last_run_at timestamptz,
  last_successful_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_column_mappings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  email_column text not null default 'email',
  first_name_column text default 'first_name',
  last_name_column text default 'last_name',
  organization_column text default 'organization',
  website_column text default 'website',
  state_column text default 'state',
  e_transcript_column text default 'e_transcript',
  status_column text not null default 'status',
  stage_column text not null default 'stage',
  last_sent_at_column text not null default 'last_sent_at',
  last_touch_sent_column text not null default 'last_touch_sent',
  replied_at_column text not null default 'replied_at',
  unsubscribed_at_column text not null default 'unsubscribed_at',
  error_message_column text not null default 'error_message',
  notes_column text default 'notes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_number integer not null check (step_number between 1 and 3),
  name text not null,
  subject_template text not null,
  body_template text not null,
  delay_days_after_previous_step integer not null default 0 check (delay_days_after_previous_step >= 0),
  stage_required text not null,
  stage_after_send text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, step_number)
);

create table if not exists public.send_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sequence_step_id uuid references public.sequence_steps(id) on delete set null,
  recipient_email text not null,
  recipient_row_number integer not null check (recipient_row_number > 1),
  recipient_snapshot jsonb not null default '{}'::jsonb,
  subject_rendered text not null,
  body_rendered text not null,
  gmail_message_id text,
  gmail_thread_id text,
  status text not null check (status in ('sent', 'failed', 'skipped', 'bounced', 'reply_detected', 'unsubscribed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  run_type text not null check (run_type in ('scheduled', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success', 'partial_success', 'failed')),
  rows_scanned integer not null default 0 check (rows_scanned >= 0),
  eligible_rows_found integer not null default 0 check (eligible_rows_found >= 0),
  emails_sent integer not null default 0 check (emails_sent >= 0),
  emails_skipped integer not null default 0 check (emails_skipped >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null check (reason in ('unsubscribed', 'manual_suppression', 'bounce', 'complaint', 'reply_stop')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  source text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_email text not null,
  token text not null unique,
  unsubscribed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

create table if not exists public.reply_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  send_history_id uuid references public.send_history(id) on delete set null,
  recipient_email text not null,
  gmail_thread_id text not null,
  gmail_message_id text not null,
  reply_detected_at timestamptz not null default now(),
  reply_subject text,
  snippet text,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists campaigns_google_account_id_idx on public.campaigns(google_account_id);
create index if not exists send_history_campaign_created_idx on public.send_history(campaign_id, created_at desc);
create index if not exists send_history_status_sent_at_idx on public.send_history(status, sent_at);
create index if not exists campaign_runs_campaign_started_idx on public.campaign_runs(campaign_id, started_at desc);
create index if not exists suppression_list_email_idx on public.suppression_list(lower(email));
create index if not exists reply_events_campaign_created_idx on public.reply_events(campaign_id, created_at desc);

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_google_accounts_updated_at on public.google_accounts;
create trigger set_google_accounts_updated_at
before update on public.google_accounts
for each row execute function public.set_updated_at();

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_campaign_column_mappings_updated_at on public.campaign_column_mappings;
create trigger set_campaign_column_mappings_updated_at
before update on public.campaign_column_mappings
for each row execute function public.set_updated_at();

drop trigger if exists set_sequence_steps_updated_at on public.sequence_steps;
create trigger set_sequence_steps_updated_at
before update on public.sequence_steps
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.google_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_column_mappings enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.send_history enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.suppression_list enable row level security;
alter table public.unsubscribe_events enable row level security;
alter table public.reply_events enable row level security;
