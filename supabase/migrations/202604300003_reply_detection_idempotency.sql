create unique index if not exists reply_events_send_thread_recipient_idx
  on public.reply_events(send_history_id, gmail_thread_id, lower(recipient_email))
  where send_history_id is not null;
