-- NEXORA ALPHA COMMUNITY CHAT
-- Run this AFTER SUPABASE_ADMIN_SETUP.sql in Supabase SQL Editor.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  content text not null check (char_length(content) between 1 and 2000),
  reply_to uuid references public.chat_messages(id) on delete set null,
  pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_idx on public.chat_messages(created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages(user_id);

alter table public.chat_messages enable row level security;
alter table public.chat_bans enable row level security;

create or replace function private.is_chat_banned(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_bans
    where user_id = uid
      and (expires_at is null or expires_at > now())
  );
$$;
revoke execute on function private.is_chat_banned(uuid) from public;
grant execute on function private.is_chat_banned(uuid) to authenticated;

-- A safe public-facing member view: email/settings are not exposed to chat.
create or replace view public.chat_members
with (security_invoker = true)
as
select id, username, role, avatar_url
from public.profiles;

-- Members can read chat unless they are banned. Admins can always read.
drop policy if exists "chat_messages_select_members" on public.chat_messages;
create policy "chat_messages_select_members"
on public.chat_messages for select to authenticated
using ((select private.is_admin()) or not (select private.is_chat_banned(auth.uid())));

-- Members can send only as themselves, and only when not banned.
drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
on public.chat_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and not (select private.is_chat_banned(auth.uid()))
);

-- Own messages may be soft-deleted; admins may moderate any message.
drop policy if exists "chat_messages_update_own_or_admin" on public.chat_messages;
create policy "chat_messages_update_own_or_admin"
on public.chat_messages for update to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()))
with check (user_id = (select auth.uid()) or (select private.is_admin()));

-- Admin-only ban management.
drop policy if exists "chat_bans_admin_all" on public.chat_bans;
create policy "chat_bans_admin_all"
on public.chat_bans for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Members can read the safe view. RLS on profiles still applies to the view,
-- so add a dedicated policy for the public chat fields.
drop policy if exists "profiles_select_chat_members" on public.profiles;
create policy "profiles_select_chat_members"
on public.profiles for select to authenticated
using (true);

-- Realtime: publish message changes to the chat channel.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Optional storage bucket for future chat media uploads.
insert into storage.buckets (id,name,public)
values ('chat-media','chat-media',true)
on conflict (id) do nothing;

drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects for select to authenticated
using (bucket_id='chat-media');

drop policy if exists "chat_media_insert_own" on storage.objects;
create policy "chat_media_insert_own" on storage.objects for insert to authenticated
with check (bucket_id='chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "chat_media_delete_own_or_admin" on storage.objects;
create policy "chat_media_delete_own_or_admin" on storage.objects for delete to authenticated
using (bucket_id='chat-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin())));
