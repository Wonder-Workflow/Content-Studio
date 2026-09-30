-- Images attached to a calendar post.
-- Files live in the private post-media bucket at
-- {agency_id}/{client_id}/{post_id}/{media_id}.{png|jpg|webp}.
-- Members of that client's studio can read and write. Other studios cannot.
-- Video is rejected. source is upload only; generated art is a later source value.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null,
  position integer not null,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  source text not null default 'upload',
  created_at timestamptz not null default now(),
  constraint post_media_kind check (kind in ('carousel', 'static', 'cover')),
  constraint post_media_position check (
    (kind = 'carousel' and position between 0 and 9)
    or (kind in ('static', 'cover') and position = 0)
  ),
  constraint post_media_mime check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint post_media_byte_size check (byte_size between 1 and 10485760),
  constraint post_media_source check (source = 'upload'),
  constraint post_media_path_length check (char_length(storage_path) between 1 and 400),
  constraint post_media_path_unique unique (storage_path),
  constraint post_media_slot_unique unique (post_id, kind, position) deferrable initially deferred
);

create index post_media_post_id_idx on public.post_media (post_id, kind, position);

comment on table public.post_media is
  'Ordered images for one post. kind is carousel, static, or cover. source is upload; generated art is not implemented.';
comment on column public.post_media.kind is 'carousel (up to 10), static (one), or cover (one manual thumbnail).';
comment on column public.post_media.source is 'upload only. Add a later source here for generated art. Do not add a second board.';

create or replace function private.post_media_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_client uuid;
  agency uuid;
  expected_prefix text;
begin
  select posts.client_id, clients.agency_id
  into post_client, agency
  from public.posts as posts
  join public.clients as clients on clients.id = posts.client_id
  where posts.id = new.post_id;

  if post_client is null then
    raise exception 'That post is not on this calendar.';
  end if;

  if new.client_id is distinct from post_client then
    raise exception 'That image does not belong to this client.';
  end if;

  expected_prefix := agency::text || '/' || post_client::text || '/' || new.post_id::text || '/';
  if position(expected_prefix in new.storage_path) <> 1 then
    raise exception 'That image path is not valid.';
  end if;

  if new.kind = 'carousel' and (
    select count(*)
    from public.post_media
    where post_id = new.post_id
      and kind = 'carousel'
      and id is distinct from new.id
  ) >= 10 then
    raise exception 'A carousel can have at most 10 images.';
  end if;

  return new;
end;
$$;

create trigger post_media_guard
before insert or update on public.post_media
for each row execute function private.post_media_guard();

create or replace function private.delete_post_media_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects
  where bucket_id = 'post-media'
    and name = old.storage_path;
  return old;
exception
  when others then
    raise warning 'post media object was not removed: %', sqlerrm;
    return old;
end;
$$;

create trigger post_media_delete_object
after delete on public.post_media
for each row execute function private.delete_post_media_object();

create or replace function private.post_media_object_allowed(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
  agency_id uuid;
  client_id uuid;
  post_id uuid;
  uuid_re constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
begin
  parts := storage.foldername(object_name);
  if parts is null or cardinality(parts) <> 3 then
    return false;
  end if;
  if parts[1] !~ ('^' || uuid_re || '$')
    or parts[2] !~ ('^' || uuid_re || '$')
    or parts[3] !~ ('^' || uuid_re || '$') then
    return false;
  end if;
  if coalesce(storage.filename(object_name), '') !~ ('^' || uuid_re || '\.(png|jpg|webp)$') then
    return false;
  end if;

  agency_id := parts[1]::uuid;
  client_id := parts[2]::uuid;
  post_id := parts[3]::uuid;

  return exists (
    select 1
    from public.posts as posts
    join public.clients as clients on clients.id = posts.client_id
    where posts.id = post_id
      and posts.client_id = client_id
      and clients.agency_id = agency_id
      and private.is_agency_member(agency_id)
  );
end;
$$;

revoke all on function private.post_media_guard() from public, anon, authenticated;
revoke all on function private.delete_post_media_object() from public, anon, authenticated;
revoke all on function private.post_media_object_allowed(text) from public, anon, authenticated;
grant execute on function private.post_media_object_allowed(text) to authenticated;

create or replace function public.reorder_carousel_media(
  target_post_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in.';
  end if;

  if ordered_ids is null or cardinality(ordered_ids) > 10 then
    raise exception 'A carousel can have at most 10 images.';
  end if;

  if (
    select count(*)
    from unnest(ordered_ids) as incoming (id)
  ) <> (
    select count(distinct incoming.id)
    from unnest(ordered_ids) as incoming (id)
  ) then
    raise exception 'Refresh the pack and try the order again.';
  end if;

  if not exists (
    select 1
    from public.posts
    where id = target_post_id
      and private.can_access_client(client_id)
  ) then
    raise exception 'You cannot edit images for this client.';
  end if;

  if (
    select count(*)
    from public.post_media
    where post_id = target_post_id
      and kind = 'carousel'
  ) <> cardinality(ordered_ids) then
    raise exception 'Refresh the pack and try the order again.';
  end if;

  update public.post_media as media
  set position = incoming.ordinality::integer - 1
  from unnest(ordered_ids) with ordinality as incoming (id, ordinality)
  where media.id = incoming.id
    and media.post_id = target_post_id
    and media.kind = 'carousel';

  get diagnostics updated_count = row_count;
  if updated_count <> cardinality(ordered_ids) then
    raise exception 'Refresh the pack and try the order again.';
  end if;
end;
$$;

revoke all on function public.reorder_carousel_media(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_carousel_media(uuid, uuid[]) to authenticated;

alter table public.post_media enable row level security;

create policy post_media_select_member
on public.post_media
for select
to authenticated
using (private.can_access_client(client_id));

create policy post_media_insert_member
on public.post_media
for insert
to authenticated
with check (
  private.can_access_client(client_id)
  and exists (
    select 1
    from public.posts
    where id = post_id
      and client_id = post_media.client_id
  )
);

create policy post_media_update_member
on public.post_media
for update
to authenticated
using (private.can_access_client(client_id))
with check (
  private.can_access_client(client_id)
  and exists (
    select 1
    from public.posts
    where id = post_id
      and client_id = post_media.client_id
  )
);

create policy post_media_delete_member
on public.post_media
for delete
to authenticated
using (private.can_access_client(client_id));

revoke all on table public.post_media from anon, authenticated;
grant select, insert, update, delete on table public.post_media to authenticated;

create policy post_media_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'post-media'
  and private.post_media_object_allowed(name)
);

create policy post_media_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and private.post_media_object_allowed(name)
);

create policy post_media_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-media'
  and private.post_media_object_allowed(name)
)
with check (
  bucket_id = 'post-media'
  and private.post_media_object_allowed(name)
);

create policy post_media_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-media'
  and private.post_media_object_allowed(name)
);
