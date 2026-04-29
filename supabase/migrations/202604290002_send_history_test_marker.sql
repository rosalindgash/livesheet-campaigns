alter table public.send_history
add column if not exists send_type text not null default 'campaign'
check (send_type in ('campaign', 'test'));

create index if not exists send_history_send_type_created_idx
on public.send_history(send_type, created_at desc);
