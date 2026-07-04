-- Timetable Studio simple sync table
-- Run this in Supabase SQL Editor.

create table if not exists public.timetable_sync (
  sync_code text primary key,
  payload jsonb not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timetable_sync_updated_at_idx
  on public.timetable_sync (updated_at desc);

-- Optional cleanup helper if you ever want to delete old sync records manually:
-- delete from public.timetable_sync where updated_at < now() - interval '180 days';
