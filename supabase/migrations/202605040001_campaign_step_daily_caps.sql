alter table public.campaigns
add column if not exists touch_1_daily_cap integer not null default 20 check (touch_1_daily_cap >= 0),
add column if not exists touch_2_daily_cap integer not null default 20 check (touch_2_daily_cap >= 0),
add column if not exists touch_3_daily_cap integer not null default 0 check (touch_3_daily_cap >= 0);
