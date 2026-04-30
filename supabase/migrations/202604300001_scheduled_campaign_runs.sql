alter table public.campaign_runs
  add column if not exists scheduled_date date;

create unique index if not exists campaign_runs_scheduled_once_idx
  on public.campaign_runs(campaign_id, scheduled_date)
  where run_type = 'scheduled' and scheduled_date is not null;
