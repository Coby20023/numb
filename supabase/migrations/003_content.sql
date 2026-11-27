-- Website content managed from the admin dashboard. Run after 001 (schema.sql) and 002.
-- Nothing is published until an admin sets status = 'published'. Empty tables show an
-- honest "coming soon" message on the site. No sample data is inserted here.

create table if not exists public.packages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 2 and 160),
  summary     text check (char_length(summary) <= 400),
  description text check (char_length(description) <= 5000),
  duration    text check (char_length(duration) <= 120),
  price_text  text check (char_length(price_text) <= 160),   -- entered by the business only; shown exactly as written
  includes    text check (char_length(includes) <= 2000),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  int not null default 0
);

create table if not exists public.accommodation (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 160),
  location    text check (char_length(location) <= 160),
  description text check (char_length(description) <= 5000),
  price_text  text check (char_length(price_text) <= 160),
  contact_note text check (char_length(contact_note) <= 300),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  int not null default 0
);

create table if not exists public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  title        text not null check (char_length(title) between 2 and 200),
  excerpt      text check (char_length(excerpt) <= 400),
  body         text check (char_length(body) <= 30000),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz
);

create table if not exists public.site_settings (
  key        text primary key check (key in ('business_email', 'business_phone', 'business_address', 'whatsapp_number')),
  value      text not null check (char_length(value) <= 300),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.packages      enable row level security;
alter table public.accommodation enable row level security;
alter table public.blog_posts    enable row level security;
alter table public.site_settings enable row level security;

create policy "public read published packages" on public.packages
  for select to anon, authenticated using (status = 'published');
create policy "admins manage packages" on public.packages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read published accommodation" on public.accommodation
  for select to anon, authenticated using (status = 'published');
create policy "admins manage accommodation" on public.accommodation
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read published blog" on public.blog_posts
  for select to anon, authenticated using (status = 'published');
create policy "admins manage blog" on public.blog_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read settings" on public.site_settings
  for select to anon, authenticated using (true);
create policy "admins manage settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
