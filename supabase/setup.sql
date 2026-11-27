-- Moyenda direct-client content, admin, booking, inquiry and Storage policies.
-- Run after schema.sql, migrations/002_instagram.sql, and migrations/003_content.sql.
-- No demo rows are inserted. This script is additive and does not drop existing tables.

alter table public.packages
  add column if not exists image_path text;

alter table public.accommodation
  add column if not exists image_path text;

create table if not exists public.destinations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 160),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  summary     text check (char_length(summary) <= 400),
  description text check (char_length(description) <= 5000),
  image_path  text check (image_path is null or image_path ~* '^assets/images/[A-Za-z0-9][A-Za-z0-9._-]{0,180}[.](avif|gif|jpe?g|png|svg|webp)$'),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  int not null default 0
);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 160),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  category    text check (char_length(category) <= 80),
  summary     text check (char_length(summary) <= 400),
  description text check (char_length(description) <= 5000),
  image_path  text check (image_path is null or image_path ~* '^assets/images/[A-Za-z0-9][A-Za-z0-9._-]{0,180}[.](avif|gif|jpe?g|png|svg|webp)$'),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  int not null default 0
);

create table if not exists public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 2 and 160),
  alt_text    text not null check (char_length(alt_text) between 2 and 300),
  category    text check (char_length(category) <= 80),
  image_path  text check (image_path is null or image_path ~* '^assets/images/[A-Za-z0-9][A-Za-z0-9._-]{0,180}[.](avif|gif|jpe?g|png|svg|webp)$'),
  storage_path text check (storage_path is null or (storage_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,299}$' and storage_path !~ '(^|/)\.\.?(/|$)')),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  int not null default 0,
  constraint gallery_items_one_image_source check (num_nonnulls(image_path, storage_path) = 1)
);

alter table public.gallery_items add column if not exists storage_path text;
alter table public.gallery_items alter column image_path drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gallery_items'::regclass
      and conname = 'gallery_items_one_image_source'
  ) then
    alter table public.gallery_items
      add constraint gallery_items_one_image_source
      check (num_nonnulls(image_path, storage_path) = 1);
  end if;
end
$$;

create table if not exists public.website_content (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  content_key text not null unique check (content_key in (
                'intro_title', 'intro_description', 'hero_eyebrow', 'contact_prompt')),
  value       text not null check (char_length(value) between 1 and 5000),
  status      text not null default 'draft' check (status in ('draft', 'published'))
);

create table if not exists public.customer_inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 120),
  email       text not null check (char_length(email) between 5 and 200 and email like '%_@_%._%'),
  phone       text check (phone is null or char_length(phone) <= 40),
  subject     text not null check (char_length(subject) between 2 and 160),
  message     text not null check (char_length(message) between 2 and 3000),
  status      text not null default 'new' check (status in ('new', 'replied', 'closed')),
  internal_note text check (internal_note is null or char_length(internal_note) <= 2000)
);
create index if not exists customer_inquiries_created_idx
  on public.customer_inquiries (created_at desc);

create or replace function public.can_manage_homepage_content()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

create or replace function public.can_delete_homepage_content()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.can_manage_homepage_content() from public, anon, authenticated;
revoke all on function public.can_delete_homepage_content() from public, anon, authenticated;
grant execute on function public.can_manage_homepage_content() to authenticated;
grant execute on function public.can_delete_homepage_content() to authenticated;

create index if not exists destinations_published_order_idx
  on public.destinations (status, sort_order, created_at desc);
create index if not exists activities_published_order_idx
  on public.activities (status, sort_order, created_at desc);
create index if not exists gallery_items_published_order_idx
  on public.gallery_items (status, sort_order, created_at desc);

alter table public.destinations enable row level security;
alter table public.activities enable row level security;
alter table public.gallery_items enable row level security;
alter table public.website_content enable row level security;
alter table public.customer_inquiries enable row level security;

grant select on public.destinations, public.activities, public.gallery_items, public.website_content
  to anon, authenticated;
grant insert, update, delete on public.destinations, public.activities, public.gallery_items, public.website_content
  to authenticated;
grant select, insert, update, delete on public.packages, public.accommodation, public.blog_posts,
  public.site_settings, public.destinations, public.activities, public.gallery_items,
  public.website_content, public.customer_inquiries to authenticated;
grant select on public.packages, public.accommodation, public.blog_posts, public.site_settings,
  public.destinations, public.activities, public.gallery_items, public.website_content,
  public.instagram_media to anon, authenticated;
grant insert on public.bookings, public.customer_inquiries to anon, authenticated;
grant select, update, delete on public.bookings, public.customer_inquiries to authenticated;
grant select on public.admin_users, public.faq_entries, public.bookings, public.unanswered_questions,
  public.conversations, public.messages, public.instagram_sync_status to authenticated;
grant update on public.faq_entries, public.unanswered_questions to authenticated;
grant insert on public.faq_entries to authenticated;
grant delete on public.faq_entries, public.unanswered_questions to authenticated;

drop policy if exists "public read published destinations" on public.destinations;
create policy "public read published destinations" on public.destinations
  for select to anon, authenticated using (status = 'published');
drop policy if exists "admins read all destinations" on public.destinations;
create policy "admins read all destinations" on public.destinations
  for select to authenticated using (public.is_admin());
drop policy if exists "editors insert destinations" on public.destinations;
create policy "editors insert destinations" on public.destinations
  for insert to authenticated with check (public.can_manage_homepage_content());
drop policy if exists "editors update destinations" on public.destinations;
create policy "editors update destinations" on public.destinations
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
drop policy if exists "owners delete destinations" on public.destinations;
create policy "owners delete destinations" on public.destinations
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "public read published activities" on public.activities;
create policy "public read published activities" on public.activities
  for select to anon, authenticated using (status = 'published');
drop policy if exists "admins read all activities" on public.activities;
create policy "admins read all activities" on public.activities
  for select to authenticated using (public.is_admin());
drop policy if exists "editors insert activities" on public.activities;
create policy "editors insert activities" on public.activities
  for insert to authenticated with check (public.can_manage_homepage_content());
drop policy if exists "editors update activities" on public.activities;
create policy "editors update activities" on public.activities
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
drop policy if exists "owners delete activities" on public.activities;
create policy "owners delete activities" on public.activities
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "public read published gallery" on public.gallery_items;
create policy "public read published gallery" on public.gallery_items
  for select to anon, authenticated using (status = 'published');
drop policy if exists "admins read all gallery" on public.gallery_items;
create policy "admins read all gallery" on public.gallery_items
  for select to authenticated using (public.is_admin());
drop policy if exists "editors insert gallery" on public.gallery_items;
create policy "editors insert gallery" on public.gallery_items
  for insert to authenticated with check (public.can_manage_homepage_content());
drop policy if exists "editors update gallery" on public.gallery_items;
create policy "editors update gallery" on public.gallery_items
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
drop policy if exists "owners delete gallery" on public.gallery_items;
create policy "owners delete gallery" on public.gallery_items
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "public read published website content" on public.website_content;
create policy "public read published website content" on public.website_content
  for select to anon, authenticated using (status = 'published');
drop policy if exists "admins read all website content" on public.website_content;
create policy "admins read all website content" on public.website_content
  for select to authenticated using (public.is_admin());
drop policy if exists "editors insert website content" on public.website_content;
create policy "editors insert website content" on public.website_content
  for insert to authenticated with check (public.can_manage_homepage_content());
drop policy if exists "editors update website content" on public.website_content;
create policy "editors update website content" on public.website_content
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
drop policy if exists "owners delete website content" on public.website_content;
create policy "owners delete website content" on public.website_content
  for delete to authenticated using (public.can_delete_homepage_content());

-- Replace broad legacy admin policies: viewers are read-only, editors may insert/update,
-- and only owners may delete.
drop policy if exists "admins manage packages" on public.packages;
drop policy if exists "admins read all packages" on public.packages;
drop policy if exists "editors insert packages" on public.packages;
drop policy if exists "editors update packages" on public.packages;
drop policy if exists "owners delete packages" on public.packages;
create policy "admins read all packages" on public.packages
  for select to authenticated using (public.is_admin());
create policy "editors insert packages" on public.packages
  for insert to authenticated with check (public.can_manage_homepage_content());
create policy "editors update packages" on public.packages
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete packages" on public.packages
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage accommodation" on public.accommodation;
drop policy if exists "admins read all accommodation" on public.accommodation;
drop policy if exists "editors insert accommodation" on public.accommodation;
drop policy if exists "editors update accommodation" on public.accommodation;
drop policy if exists "owners delete accommodation" on public.accommodation;
create policy "admins read all accommodation" on public.accommodation
  for select to authenticated using (public.is_admin());
create policy "editors insert accommodation" on public.accommodation
  for insert to authenticated with check (public.can_manage_homepage_content());
create policy "editors update accommodation" on public.accommodation
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete accommodation" on public.accommodation
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage blog" on public.blog_posts;
drop policy if exists "admins read all blog posts" on public.blog_posts;
drop policy if exists "editors insert blog posts" on public.blog_posts;
drop policy if exists "editors update blog posts" on public.blog_posts;
drop policy if exists "owners delete blog posts" on public.blog_posts;
create policy "admins read all blog posts" on public.blog_posts
  for select to authenticated using (public.is_admin());
create policy "editors insert blog posts" on public.blog_posts
  for insert to authenticated with check (public.can_manage_homepage_content());
create policy "editors update blog posts" on public.blog_posts
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete blog posts" on public.blog_posts
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage settings" on public.site_settings;
drop policy if exists "admins read settings" on public.site_settings;
drop policy if exists "editors insert settings" on public.site_settings;
drop policy if exists "editors update settings" on public.site_settings;
drop policy if exists "owners delete settings" on public.site_settings;
create policy "admins read settings" on public.site_settings
  for select to authenticated using (public.is_admin());
create policy "editors insert settings" on public.site_settings
  for insert to authenticated with check (public.can_manage_homepage_content());
create policy "editors update settings" on public.site_settings
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete settings" on public.site_settings
  for delete to authenticated using (public.can_delete_homepage_content());

-- Existing booking requests are public inserts only; all reads/updates remain admin-gated.
drop policy if exists "public can submit bookings" on public.bookings;
drop policy if exists "admins manage bookings" on public.bookings;
drop policy if exists "admins read bookings" on public.bookings;
drop policy if exists "editors update bookings" on public.bookings;
drop policy if exists "owners delete bookings" on public.bookings;
create policy "public can submit bookings" on public.bookings
  for insert to anon, authenticated with check (status = 'requested' and internal_note is null);
create policy "admins read bookings" on public.bookings
  for select to authenticated using (public.is_admin());
create policy "editors update bookings" on public.bookings
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete bookings" on public.bookings
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage customer inquiries" on public.customer_inquiries;
drop policy if exists "public submit customer inquiries" on public.customer_inquiries;
drop policy if exists "admins read customer inquiries" on public.customer_inquiries;
drop policy if exists "editors update customer inquiries" on public.customer_inquiries;
drop policy if exists "owners delete customer inquiries" on public.customer_inquiries;
create policy "public submit customer inquiries" on public.customer_inquiries
  for insert to anon, authenticated with check (status = 'new' and internal_note is null);
create policy "admins read customer inquiries" on public.customer_inquiries
  for select to authenticated using (public.is_admin());
create policy "editors update customer inquiries" on public.customer_inquiries
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete customer inquiries" on public.customer_inquiries
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage faq" on public.faq_entries;
drop policy if exists "admins read all faq" on public.faq_entries;
drop policy if exists "editors insert faq" on public.faq_entries;
drop policy if exists "editors update faq" on public.faq_entries;
drop policy if exists "owners delete faq" on public.faq_entries;
create policy "admins read all faq" on public.faq_entries
  for select to authenticated using (public.is_admin());
create policy "editors insert faq" on public.faq_entries
  for insert to authenticated with check (public.can_manage_homepage_content());
create policy "editors update faq" on public.faq_entries
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete faq" on public.faq_entries
  for delete to authenticated using (public.can_delete_homepage_content());

drop policy if exists "admins manage unanswered" on public.unanswered_questions;
drop policy if exists "admins read unanswered" on public.unanswered_questions;
drop policy if exists "editors update unanswered" on public.unanswered_questions;
drop policy if exists "owners delete unanswered" on public.unanswered_questions;
create policy "admins read unanswered" on public.unanswered_questions
  for select to authenticated using (public.is_admin());
create policy "editors update unanswered" on public.unanswered_questions
  for update to authenticated using (public.can_manage_homepage_content()) with check (public.can_manage_homepage_content());
create policy "owners delete unanswered" on public.unanswered_questions
  for delete to authenticated using (public.can_delete_homepage_content());

-- Direct frontend image uploads use a public read bucket, but writes remain role-restricted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moyenda-gallery', 'moyenda-gallery', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read Moyenda gallery files" on storage.objects;
create policy "public read Moyenda gallery files" on storage.objects
  for select to anon, authenticated using (bucket_id = 'moyenda-gallery');
drop policy if exists "editors upload Moyenda gallery files" on storage.objects;
create policy "editors upload Moyenda gallery files" on storage.objects
  for insert to authenticated with check (bucket_id = 'moyenda-gallery' and public.can_manage_homepage_content());
drop policy if exists "editors update Moyenda gallery files" on storage.objects;
create policy "editors update Moyenda gallery files" on storage.objects
  for update to authenticated using (bucket_id = 'moyenda-gallery' and public.can_manage_homepage_content())
  with check (bucket_id = 'moyenda-gallery' and public.can_manage_homepage_content());
drop policy if exists "owners delete Moyenda gallery files" on storage.objects;
create policy "owners delete Moyenda gallery files" on storage.objects
  for delete to authenticated using (bucket_id = 'moyenda-gallery' and public.can_delete_homepage_content());
