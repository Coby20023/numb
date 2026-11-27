-- =========================================================
-- Moyenda Tour Guide: Supabase (PostgreSQL) schema
-- Run in the Supabase SQL editor, once, on a new project.
-- Row Level Security is enabled on every table. The public (anon)
-- role can only insert bookings and read APPROVED FAQ entries.
-- Everything else is reachable only by Netlify functions (service
-- role key, kept server-side) and by signed-in admins.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Admin roles ----------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------- Bookings ----------
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  full_name     text not null check (char_length(full_name) between 2 and 120),
  email         text not null check (char_length(email) between 5 and 200 and email like '%_@_%._%'),
  phone         text not null check (char_length(phone) between 6 and 40),
  activity      text not null check (char_length(activity) between 2 and 80),
  destination   text check (char_length(destination) <= 120),
  tour_date     date,
  participants  int not null default 1 check (participants between 1 and 50),
  message       text check (char_length(message) <= 2000),
  status        text not null default 'requested' check (status in ('requested', 'contacted', 'confirmed', 'paid', 'cancelled')),
  internal_note text
);

-- ---------- FAQ knowledge base (approval workflow) ----------
-- Only entries with status = 'approved' are ever shown to visitors or used by the AI.
create table if not exists public.faq_entries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  category    text not null check (category in (
                'about', 'hiking', 'safaris', 'destinations', 'tour_preparation',
                'bookings', 'travel_information', 'safety', 'wildlife', 'customer_support')),
  question    text not null check (char_length(question) between 5 and 400),
  answer      text not null check (char_length(answer) between 5 and 4000),
  status      text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  search_vec  tsvector generated always as (
                setweight(to_tsvector('english', coalesce(question, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(answer, '')), 'B')
              ) stored
);
create index if not exists faq_search_idx on public.faq_entries using gin (search_vec);

-- ---------- Conversations with MOYENDA AI GUIDE ----------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  page_path   text check (char_length(page_path) <= 300),
  user_agent  text check (char_length(user_agent) <= 300)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) <= 4000),
  faq_ids         uuid[] not null default '{}'
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ---------- Unanswered questions and human escalation ----------
create table if not exists public.unanswered_questions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  question        text not null check (char_length(question) <= 1000),
  conversation_id uuid references public.conversations(id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'escalated', 'answered', 'dismissed')),
  admin_notes     text
);

-- ---------- Feedback on AI answers ----------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  message_id  uuid references public.messages(id) on delete cascade,
  helpful     boolean not null,
  comment     text check (char_length(comment) <= 1000)
);

-- ---------- Rate limiting (used by functions via RPC) ----------
create table if not exists public.rate_limits (
  bucket_key   text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into public.rate_limits as r (bucket_key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning (hits <= p_limit) into allowed;
  return allowed;
end;
$$;

-- ---------- Retrieval for the AI guide (full-text search, approved entries only) ----------
create or replace function public.search_faq(p_query text, p_limit int default 5)
returns table (id uuid, category text, question text, answer text, rank real)
language sql stable security definer set search_path = public
as $$
  select f.id, f.category, f.question, f.answer,
         ts_rank(f.search_vec, websearch_to_tsquery('english', p_query)) as rank
  from public.faq_entries f
  where f.status = 'approved'
    and f.search_vec @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit least(greatest(p_limit, 1), 10);
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.admin_users        enable row level security;
alter table public.bookings           enable row level security;
alter table public.faq_entries        enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.unanswered_questions enable row level security;
alter table public.feedback           enable row level security;
alter table public.rate_limits        enable row level security;

-- Admin roles: admins can see who is an admin; only owners change roles (manage via SQL / dashboard).
create policy "admins read admin_users" on public.admin_users
  for select to authenticated using (public.is_admin());

-- Bookings: anyone may submit one; only admins may read or change them. No public reads.
create policy "public can submit bookings" on public.bookings
  for insert to anon, authenticated with check (status = 'requested');
create policy "admins manage bookings" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- FAQ: visitors read approved entries; admins manage everything (drafts, approvals).
create policy "public read approved faq" on public.faq_entries
  for select to anon, authenticated using (status = 'approved');
create policy "admins manage faq" on public.faq_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Conversations, messages, unanswered questions, feedback: no anon/authenticated policies.
-- Only the service role (Netlify functions) writes them; admins read them.
create policy "admins read conversations" on public.conversations
  for select to authenticated using (public.is_admin());
create policy "admins read messages" on public.messages
  for select to authenticated using (public.is_admin());
create policy "admins manage unanswered" on public.unanswered_questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read feedback" on public.feedback
  for select to authenticated using (public.is_admin());

-- rate_limits: no policies, so only the service role (via hit_rate_limit) can touch it.

-- Functions the public may call (search_faq only reads approved rows; hit_rate_limit is service-only).
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
grant execute on function public.search_faq(text, int) to anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;

-- =========================================================
-- To make yourself an admin, after you sign up through Supabase Auth:
--   insert into public.admin_users (user_id, role)
--   select id, 'owner' from auth.users where email = 'you@example.com';
-- =========================================================
