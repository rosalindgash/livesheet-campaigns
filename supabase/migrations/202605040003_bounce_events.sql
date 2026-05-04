create table if not exists public.bounce_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  send_history_id uuid references public.send_history(id) on delete set null,
  recipient_email text,
  raw_source_message_id text not null,
  gmail_thread_id text,
  sender text,
  subject text,
  reason text,
  status_code text,
  diagnostic_code text,
  confidence text not null check (confidence in ('high', 'low')),
  action text not null check (action in ('suppressed', 'manual_review')),
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists bounce_events_raw_source_message_id_idx
  on public.bounce_events(raw_source_message_id);

create index if not exists bounce_events_campaign_detected_idx
  on public.bounce_events(campaign_id, detected_at desc);

create index if not exists bounce_events_recipient_detected_idx
  on public.bounce_events(lower(recipient_email), detected_at desc)
  where recipient_email is not null;

alter table public.bounce_events enable row level security;
