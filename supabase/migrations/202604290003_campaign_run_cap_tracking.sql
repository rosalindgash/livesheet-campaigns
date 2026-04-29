alter table public.campaign_runs
add column if not exists emails_selected_for_run integer not null default 0
check (emails_selected_for_run >= 0),
add column if not exists eligible_not_processed_due_to_cap integer not null default 0
check (eligible_not_processed_due_to_cap >= 0),
add column if not exists cap_limited boolean not null default false;
