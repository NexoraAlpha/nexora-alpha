-- NEXORA ALPHA — NEWS + WEB PUSH DATABASE SETUP
-- Run AFTER SUPABASE_ADMIN_SETUP.sql.
-- This is separate from the chat SQL.

create extension if not exists pgcrypto;

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  description text,
  source_name text not null default 'Unknown',
  source_url text not null,
  image_url text,
  published_at timestamptz not null,
  category text not null default 'low' check (category in ('breaking','high','medium','low')),
  instruments text[] not null default '{}',
  score integer not null default 10,
  raw_source text not null default 'newsapi',
  alert_sent boolean not null default false,
  alert_sent_at timestamptz,
  alert_sent_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists news_articles_published_idx on public.news_articles(published_at desc);
create index if not exists news_articles_category_idx on public.news_articles(category,published_at desc);
create index if not exists news_articles_alert_idx on public.news_articles(alert_sent,category,published_at desc);

alter table public.news_articles enable row level security;

-- The website reads news through /api/news/feed using the server service-role key.
-- No browser policy is needed.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Browser subscriptions are managed only by the Vercel server API with the service role.

-- Verify after running:
-- select count(*) from public.news_articles;
-- select count(*) from public.push_subscriptions;
