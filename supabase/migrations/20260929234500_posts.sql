-- Calendar posts for one client board.
-- A row is a single day, or a short range that shows on every day it covers.
-- Members of the client's studio can read and write. Other studios cannot.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  hook text not null default '',
  status text not null default 'idea',
  format text not null default 'Reel',
  platform text not null default '',
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint posts_hook_length check (char_length(hook) <= 800),
  constraint posts_platform_length check (char_length(platform) <= 40),
  constraint posts_status check (status in ('idea', 'in-creation', 'ready', 'published')),
  constraint posts_format check (format in ('Reel', 'Post', 'Carousel', 'Story')),
  constraint posts_range check (ends_on is null or ends_on >= starts_on),
  constraint posts_range_length check (ends_on is null or ends_on <= starts_on + 61)
);

create index posts_client_starts_on_idx on public.posts (client_id, starts_on);
create index posts_client_ends_on_idx on public.posts (client_id, ends_on);

comment on table public.posts is 'Calendar slots for a client board. ends_on is null for a single day.';
comment on column public.posts.status is 'idea, in-creation, ready, or published.';
comment on column public.posts.format is 'Reel, Post, Carousel, or Story.';
comment on column public.posts.ends_on is 'Last day the post stays on the calendar. Null means starts_on only.';

create trigger posts_set_updated_at
before update on public.posts
for each row execute function private.set_updated_at();

create or replace function private.can_access_client(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients
    where id = target_client_id
      and private.is_agency_member(agency_id)
  );
$$;

revoke all on function private.can_access_client(uuid) from public, anon, authenticated;
grant execute on function private.can_access_client(uuid) to authenticated;

alter table public.posts enable row level security;

create policy posts_select_member
on public.posts
for select
to authenticated
using (private.can_access_client(client_id));

create policy posts_insert_member
on public.posts
for insert
to authenticated
with check (private.can_access_client(client_id));

create policy posts_update_member
on public.posts
for update
to authenticated
using (private.can_access_client(client_id))
with check (private.can_access_client(client_id));

create policy posts_delete_member
on public.posts
for delete
to authenticated
using (private.can_access_client(client_id));

revoke all on table public.posts from anon, authenticated;
grant select, insert, update, delete on table public.posts to authenticated;
