create extension if not exists pgcrypto with schema extensions;

alter table public.send_history
add column if not exists unsubscribe_token text not null
default translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');

create unique index if not exists send_history_unsubscribe_token_idx
on public.send_history(unsubscribe_token);
