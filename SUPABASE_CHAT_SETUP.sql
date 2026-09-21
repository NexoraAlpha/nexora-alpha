-- NEXORA ALPHA — COMMUNITY CHAT / MEMBER LIST / PRIVATE CHAT
-- Run this AFTER the existing SUPABASE_ADMIN_SETUP.sql.
-- This file is additive: it creates only the tables, policies, RPCs and storage
-- needed by the new Community Chat feature.

create extension if not exists pgcrypto;

-- Existing profile fields used by the Nexora UI/chat directory.
alter table if exists public.profiles add column if not exists avatar_url text;
alter table if exists public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;
alter table if exists public.profiles add column if not exists last_seen timestamptz;

-- =========================================================
-- CONVERSATIONS
-- =========================================================
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','private')),
  slug text,
  direct_key text,
  name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_group_slug_unique
on public.chat_conversations(kind, slug)
where kind='group' and slug is not null;

create unique index if not exists chat_direct_key_unique
on public.chat_conversations(direct_key)
where kind='private' and direct_key is not null;

-- Main Nexora community room. One row only.
insert into public.chat_conversations(kind,slug,name)
values ('group','main','NEXORA COMMUNITY')
on conflict do nothing;

-- =========================================================
-- PARTICIPANTS
-- =========================================================
create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);

create index if not exists chat_participants_user_idx
on public.chat_participants(user_id);

create index if not exists chat_participants_conversation_idx
on public.chat_participants(conversation_id);

-- =========================================================
-- MESSAGES
-- =========================================================
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  image_url text,
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  is_announcement boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint chat_message_has_content check (
    nullif(trim(coalesce(body,'')),'') is not null or image_url is not null or deleted_at is not null
  )
);

create index if not exists chat_messages_conversation_time_idx
on public.chat_messages(conversation_id,created_at);

create index if not exists chat_messages_sender_idx
on public.chat_messages(sender_id);

-- =========================================================
-- REACTIONS
-- =========================================================
create table if not exists public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','🔥','😂','😮','👏')),
  created_at timestamptz not null default now(),
  unique(message_id,user_id,emoji)
);

create index if not exists chat_reactions_message_idx
on public.chat_reactions(message_id);

-- =========================================================
-- MODERATION
-- =========================================================
create table if not exists public.chat_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  muted_until timestamptz,
  banned_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages(id) on delete set null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

-- =========================================================
-- RLS
-- =========================================================
alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_user_controls enable row level security;
alter table public.chat_reports enable row level security;

drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select"
on public.chat_conversations for select to authenticated
using (
  kind='group'
  or exists (
    select 1 from public.chat_participants cp
    where cp.conversation_id=id and cp.user_id=(select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "chat_participants_select" on public.chat_participants;
create policy "chat_participants_select"
on public.chat_participants for select to authenticated
using (
  user_id=(select auth.uid())
  or exists (
    select 1 from public.chat_conversations c
    where c.id=conversation_id and c.kind='group'
  )
  or (select private.is_admin())
);

drop policy if exists "chat_participants_insert_own" on public.chat_participants;
create policy "chat_participants_insert_own"
on public.chat_participants for insert to authenticated
with check (user_id=(select auth.uid()));

drop policy if exists "chat_participants_update_own" on public.chat_participants;
create policy "chat_participants_update_own"
on public.chat_participants for update to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()))
with check (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
on public.chat_messages for select to authenticated
using (
  exists (
    select 1 from public.chat_participants cp
    where cp.conversation_id=chat_messages.conversation_id
      and cp.user_id=(select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
on public.chat_messages for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and exists (
    select 1 from public.chat_participants cp
    where cp.conversation_id=chat_messages.conversation_id
      and cp.user_id=(select auth.uid())
  )
  and not exists (
    select 1 from public.chat_user_controls uc
    where uc.user_id=(select auth.uid())
      and (
        (uc.banned_until is not null and uc.banned_until>now())
        or (uc.muted_until is not null and uc.muted_until>now())
      )
  )
  and (is_announcement=false or (select private.is_admin()))
);

drop policy if exists "chat_messages_update" on public.chat_messages;
create policy "chat_messages_update"
on public.chat_messages for update to authenticated
using (
  sender_id=(select auth.uid()) or (select private.is_admin())
)
with check (
  sender_id=(select auth.uid()) or (select private.is_admin())
);

drop policy if exists "chat_messages_delete" on public.chat_messages;
create policy "chat_messages_delete"
on public.chat_messages for delete to authenticated
using (sender_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "chat_reactions_select" on public.chat_reactions;
create policy "chat_reactions_select"
on public.chat_reactions for select to authenticated
using (
  exists (
    select 1 from public.chat_messages m
    join public.chat_participants cp on cp.conversation_id=m.conversation_id
    where m.id=message_id and cp.user_id=(select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "chat_reactions_insert" on public.chat_reactions;
create policy "chat_reactions_insert"
on public.chat_reactions for insert to authenticated
with check (
  user_id=(select auth.uid())
  and exists (
    select 1 from public.chat_messages m
    join public.chat_participants cp on cp.conversation_id=m.conversation_id
    where m.id=message_id and cp.user_id=(select auth.uid())
  )
);

drop policy if exists "chat_reactions_delete" on public.chat_reactions;
create policy "chat_reactions_delete"
on public.chat_reactions for delete to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "chat_controls_select" on public.chat_user_controls;
create policy "chat_controls_select"
on public.chat_user_controls for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "chat_reports_insert" on public.chat_reports;
create policy "chat_reports_insert"
on public.chat_reports for insert to authenticated
with check (reporter_id=(select auth.uid()));

drop policy if exists "chat_reports_select_admin" on public.chat_reports;
create policy "chat_reports_select_admin"
on public.chat_reports for select to authenticated
using ((select private.is_admin()));

drop policy if exists "chat_reports_update_admin" on public.chat_reports;
create policy "chat_reports_update_admin"
on public.chat_reports for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- =========================================================
-- RPC: JOIN / GET MAIN GROUP
-- =========================================================
create or replace function public.nexora_get_group_chat()
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into cid
  from public.chat_conversations
  where kind='group' and slug='main'
  limit 1;

  if cid is null then
    insert into public.chat_conversations(kind,slug,name,created_by)
    values ('group','main','NEXORA COMMUNITY',auth.uid())
    returning id into cid;
  end if;

  insert into public.chat_participants(conversation_id,user_id)
  values(cid,auth.uid())
  on conflict(conversation_id,user_id) do nothing;

  return cid;
end;
$$;

revoke execute on function public.nexora_get_group_chat() from public;
grant execute on function public.nexora_get_group_chat() to authenticated;

-- =========================================================
-- RPC: START / GET PRIVATE CHAT
-- =========================================================
create or replace function public.nexora_start_private_chat(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  cid uuid;
  k text;
  a uuid;
  b uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_other_user_id is null or p_other_user_id=auth.uid() then raise exception 'Invalid member'; end if;
  if not exists(select 1 from auth.users where id=p_other_user_id) then raise exception 'Member not found'; end if;

  a:=least(auth.uid(),p_other_user_id);
  b:=greatest(auth.uid(),p_other_user_id);
  k:=a::text||':'||b::text;

  select id into cid from public.chat_conversations
  where kind='private' and direct_key=k
  limit 1;

  if cid is null then
    insert into public.chat_conversations(kind,direct_key,name,created_by)
    values('private',k,'Private Chat',auth.uid())
    returning id into cid;
  end if;

  insert into public.chat_participants(conversation_id,user_id)
  values(cid,auth.uid()),(cid,p_other_user_id)
  on conflict(conversation_id,user_id) do nothing;

  return cid;
end;
$$;

revoke execute on function public.nexora_start_private_chat(uuid) from public;
grant execute on function public.nexora_start_private_chat(uuid) to authenticated;

-- =========================================================
-- RPC: SAFE MEMBER DIRECTORY
-- Does not expose email/password/private profile fields.
-- =========================================================
create or replace function public.nexora_member_directory(p_search text default null)
returns table(
  id uuid,
  username text,
  role text,
  avatar_url text,
  last_seen timestamptz,
  status text
)
language sql
security definer
stable
set search_path=public,private
as $$
  select
    p.id,
    p.username,
    p.role,
    p.avatar_url,
    p.last_seen,
    coalesce(p.settings->>'status','Learning & growing') as status
  from public.profiles p
  where auth.uid() is not null
    and (
      p_search is null
      or trim(p_search)=''
      or p.username ilike '%'||trim(p_search)||'%'
    )
  order by case when p.role='admin' then 0 else 1 end, lower(p.username)
  limit 250;
$$;

revoke execute on function public.nexora_member_directory(text) from public;
grant execute on function public.nexora_member_directory(text) to authenticated;

-- =========================================================
-- RPC: ADMIN MODERATION
-- action = mute / unmute / ban / unban
-- =========================================================
create or replace function public.nexora_chat_admin_control(
  p_user_id uuid,
  p_action text,
  p_minutes integer default 60
)
returns boolean
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if not (select private.is_admin()) then raise exception 'Admin only'; end if;
  if p_user_id is null or p_user_id=(select auth.uid()) then raise exception 'Invalid member'; end if;

  if p_action='mute' then
    insert into public.chat_user_controls(user_id,muted_until,updated_by,updated_at)
    values(p_user_id,now()+make_interval(mins=>greatest(1,p_minutes)),auth.uid(),now())
    on conflict(user_id) do update set muted_until=excluded.muted_until,updated_by=excluded.updated_by,updated_at=now();
  elsif p_action='unmute' then
    insert into public.chat_user_controls(user_id,muted_until,updated_by,updated_at)
    values(p_user_id,null,auth.uid(),now())
    on conflict(user_id) do update set muted_until=null,updated_by=excluded.updated_by,updated_at=now();
  elsif p_action='ban' then
    insert into public.chat_user_controls(user_id,banned_until,updated_by,updated_at)
    values(p_user_id,now()+make_interval(mins=>greatest(1,p_minutes)),auth.uid(),now())
    on conflict(user_id) do update set banned_until=excluded.banned_until,updated_by=excluded.updated_by,updated_at=now();
  elsif p_action='unban' then
    insert into public.chat_user_controls(user_id,banned_until,updated_by,updated_at)
    values(p_user_id,null,auth.uid(),now())
    on conflict(user_id) do update set banned_until=null,updated_by=excluded.updated_by,updated_at=now();
  else
    raise exception 'Unknown moderation action';
  end if;

  return true;
end;
$$;

revoke execute on function public.nexora_chat_admin_control(uuid,text,integer) from public;
grant execute on function public.nexora_chat_admin_control(uuid,text,integer) to authenticated;

-- =========================================================
-- RPC: ADMIN PIN
-- =========================================================
create or replace function public.nexora_chat_pin_message(
  p_message_id uuid,
  p_pinned boolean
)
returns boolean
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if not (select private.is_admin()) then raise exception 'Admin only'; end if;
  update public.chat_messages
  set pinned_at=case when p_pinned then now() else null end,
      updated_at=now()
  where id=p_message_id;
  if not found then raise exception 'Message not found'; end if;
  return true;
end;
$$;

revoke execute on function public.nexora_chat_pin_message(uuid,boolean) from public;
grant execute on function public.nexora_chat_pin_message(uuid,boolean) to authenticated;

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================
create or replace function public.nexora_chat_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists chat_conversations_touch on public.chat_conversations;
create trigger chat_conversations_touch before update on public.chat_conversations
for each row execute procedure public.nexora_chat_touch_updated_at();

drop trigger if exists chat_messages_touch on public.chat_messages;
create trigger chat_messages_touch before update on public.chat_messages
for each row execute procedure public.nexora_chat_touch_updated_at();

-- =========================================================
-- STORAGE: CHAT MEDIA
-- Public read URL, authenticated members can upload to their own folder.
-- =========================================================
insert into storage.buckets(id,name,public)
values('chat-media','chat-media',true)
on conflict(id) do update set public=true;

drop policy if exists "nexora_chat_media_read" on storage.objects;
create policy "nexora_chat_media_read"
on storage.objects for select
to public
using (bucket_id='chat-media');

drop policy if exists "nexora_chat_media_insert" on storage.objects;
create policy "nexora_chat_media_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id='chat-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "nexora_chat_media_update_own" on storage.objects;
create policy "nexora_chat_media_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id='chat-media'
  and owner_id=(select auth.uid())::text
)
with check (
  bucket_id='chat-media'
  and owner_id=(select auth.uid())::text
);

drop policy if exists "nexora_chat_media_delete_own" on storage.objects;
create policy "nexora_chat_media_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id='chat-media'
  and owner_id=(select auth.uid())::text
);

-- =========================================================
-- REALTIME
-- =========================================================
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_reactions') then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_participants') then
    alter publication supabase_realtime add table public.chat_participants;
  end if;
end $$;

-- Useful verification:
-- select * from public.chat_conversations;
-- select count(*) from public.chat_messages;
-- select * from public.chat_user_controls;
