-- NEXORA ALPHA: secure admin role + member profiles + admin-only online presence
-- Run this ONCE in Supabase Dashboard -> SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

alter table public.profiles enable row level security;

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- New registrations automatically get a profile with role=member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(coalesce(new.email,''),'@',1), 'Member'),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Remove any old policies so this setup is deterministic.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id or (select private.is_admin()));

-- Profiles are created by the trusted trigger above. Do not allow users to insert
-- arbitrary profile/role rows from the browser.
revoke all on table public.profiles from anon;
grant select on table public.profiles to authenticated;

-- Make the EXISTING owner account an admin.
-- IMPORTANT: replace the email below with the email of your own owner account.
insert into public.profiles (id, username, role)
select
  id,
  coalesce(nullif(raw_user_meta_data->>'username',''), split_part(coalesce(email,''),'@',1), 'Nexora Alpha'),
  'admin'
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL_HERE')
on conflict (id) do update set role = 'admin';

-- ===== ADMIN-ONLY ONLINE PRESENCE =====
-- Members may announce their own presence, but only admins can receive/view it.
-- The website uses a private Realtime channel named nexora:online.

drop policy if exists "nexora_online_receive_admin" on realtime.messages;
drop policy if exists "nexora_online_send_authenticated" on realtime.messages;

create policy "nexora_online_receive_admin"
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and topic = 'nexora:online'
  and (select private.is_admin())
);

create policy "nexora_online_send_authenticated"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and topic = 'nexora:online'
);

-- After running this SQL, verify your profile:
-- select id, email, raw_user_meta_data->>'username' as username from auth.users;
-- select id, username, role from public.profiles;
