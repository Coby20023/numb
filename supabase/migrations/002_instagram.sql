-- Instagram Graph API cache. Run after schema.sql.
-- Posts are public on Instagram, so visitors may read them.
-- Only the service role (sync function) writes to these tables.

create table if not exists public.instagram_media (
  id            text primary key,                 -- Instagram media ID
  media_type    text not null check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  caption       text check (char_length(caption) <= 5000),
  media_url     text,                             -- direct media URL from Graph API (expires; refreshed on each sync)
  thumbnail_url text,                             -- video thumbnail
  permalink     text not null,                    -- link to the original post on Instagram
  posted_at     timestamptz not null,
  synced_at     timestamptz not null default now()
);
create index if not exists instagram_media_posted_idx on public.instagram_media (posted_at desc);

create table if not exists public.instagram_sync_status (
  id                 int primary key default 1 check (id = 1),  -- single row
  last_attempt_at    timestamptz,
  last_success_at    timestamptz,
  last_error         text check (char_length(last_error) <= 500),
  last_error_code    int,                         -- e.g. 190 = expired or invalid access token
  posts_stored       int not null default 0,
  token_status       text not null default 'unknown' check (token_status in ('unknown', 'ok', 'expired', 'error'))
);
insert into public.instagram_sync_status (id) values (1) on conflict do nothing;

alter table public.instagram_media enable row level security;
alter table public.instagram_sync_status enable row level security;

create policy "public read instagram media" on public.instagram_media
  for select to anon, authenticated using (true);

-- Sync status is internal: only admins can read it (the dashboard reads it through the service role).
create policy "admins read instagram status" on public.instagram_sync_status
  for select to authenticated using (public.is_admin());
