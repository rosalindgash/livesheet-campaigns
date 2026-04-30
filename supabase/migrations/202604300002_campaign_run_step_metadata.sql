alter table public.campaign_runs
  add column if not exists run_metadata jsonb not null default '{}'::jsonb;
