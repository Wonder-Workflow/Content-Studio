-- Content Studio v1
-- One agency, equal seats, every member can see every client on that agency.
-- There is no role column. Brand is a JSON placeholder for a later editor.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_name_length check (char_length(btrim(name)) between 1 and 80)
);

create table public.agency_members (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create index agency_members_user_id_idx on public.agency_members (user_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  slug text not null,
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint clients_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint clients_brand_object check (jsonb_typeof(brand) = 'object'),
  constraint clients_agency_slug_unique unique (agency_id, slug)
);

create index clients_agency_id_idx on public.clients (agency_id);

comment on table public.agencies is 'An agency (studio). All seats are equal.';
comment on table public.agency_members is 'Membership only. No roles in v1.';
comment on column public.clients.brand is 'Placeholder for later brand notes. Empty object until an editor exists.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agencies_set_updated_at
before update on public.agencies
for each row execute function private.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function private.set_updated_at();

-- The creator becomes a member in the same transaction. Direct inserts into
-- agency_members are not granted, so a user cannot add themselves to a studio.
create or replace function private.handle_new_agency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in to create a studio.';
  end if;

  insert into public.agency_members (agency_id, user_id)
  values (new.id, auth.uid());

  return new;
end;
$$;

create trigger agencies_add_creator
after insert on public.agencies
for each row execute function private.handle_new_agency();

create or replace function private.is_agency_member(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.add_member_by_email(target_agency_id uuid, member_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in.';
  end if;

  if not private.is_agency_member(target_agency_id) then
    raise exception 'You are not a member of this studio.';
  end if;

  if member_email is null or char_length(btrim(member_email)) = 0 then
    raise exception 'Enter an email address.';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(btrim(member_email));

  if target_user_id is null then
    raise exception 'No account found for that email. Ask them to sign up first.';
  end if;

  insert into public.agency_members (agency_id, user_id)
  values (target_agency_id, target_user_id)
  on conflict do nothing;
end;
$$;

create or replace function private.list_agency_members(target_agency_id uuid)
returns table (user_id uuid, email text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in.';
  end if;

  if not private.is_agency_member(target_agency_id) then
    raise exception 'You are not a member of this studio.';
  end if;

  return query
  select members.user_id, coalesce(users.email::text, ''), members.created_at
  from public.agency_members as members
  join auth.users as users on users.id = members.user_id
  where members.agency_id = target_agency_id
  order by members.created_at;
end;
$$;

-- Public wrappers are security invoker. The privileged work stays in private,
-- which is not exposed through the Data API.
create or replace function public.add_agency_member(target_agency_id uuid, member_email text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.add_member_by_email(target_agency_id, member_email);
end;
$$;

create or replace function public.list_agency_members(target_agency_id uuid)
returns table (user_id uuid, email text, joined_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  select listed.user_id, listed.email, listed.joined_at
  from private.list_agency_members(target_agency_id) as listed;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_agency() from public, anon, authenticated;
revoke all on function private.is_agency_member(uuid) from public, anon, authenticated;
revoke all on function private.add_member_by_email(uuid, text) from public, anon, authenticated;
revoke all on function private.list_agency_members(uuid) from public, anon, authenticated;

grant execute on function private.is_agency_member(uuid) to authenticated;
grant execute on function private.add_member_by_email(uuid, text) to authenticated;
grant execute on function private.list_agency_members(uuid) to authenticated;

revoke all on function public.add_agency_member(uuid, text) from public, anon, authenticated;
revoke all on function public.list_agency_members(uuid) from public, anon, authenticated;
grant execute on function public.add_agency_member(uuid, text) to authenticated;
grant execute on function public.list_agency_members(uuid) to authenticated;

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.clients enable row level security;

create policy agencies_select_member
on public.agencies
for select
to authenticated
using (private.is_agency_member(id));

-- A signed-in person with no studio yet can create one. The trigger adds them.
create policy agencies_insert_first_studio
on public.agencies
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not exists (
    select 1
    from public.agency_members
    where user_id = (select auth.uid())
  )
);

create policy agencies_update_member
on public.agencies
for update
to authenticated
using (private.is_agency_member(id))
with check (private.is_agency_member(id));

create policy agency_members_select_member
on public.agency_members
for select
to authenticated
using (private.is_agency_member(agency_id));

create policy clients_select_member
on public.clients
for select
to authenticated
using (private.is_agency_member(agency_id));

create policy clients_insert_member
on public.clients
for insert
to authenticated
with check (private.is_agency_member(agency_id));

create policy clients_update_member
on public.clients
for update
to authenticated
using (private.is_agency_member(agency_id))
with check (private.is_agency_member(agency_id));

create policy clients_delete_member
on public.clients
for delete
to authenticated
using (private.is_agency_member(agency_id));

revoke all on table public.agencies from anon, authenticated;
revoke all on table public.agency_members from anon, authenticated;
revoke all on table public.clients from anon, authenticated;

grant select, insert, update on table public.agencies to authenticated;
grant select on table public.agency_members to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
