-- Generate batch.
--
-- One batch_jobs row is one window of draft posts for a client. The app writes
-- the posts, then queues art_jobs for DOT. This database does not call an
-- image model. Slack is still optional. Jobs queue either way.
--
-- posts.batch_id and art_jobs.batch_id point at the batch so a revision can
-- target one pack or the whole window.
--
-- hold_media on an art job means DOT's images land in art_pending_media.
-- The images already on the pack stay until someone accepts or discards.
-- Reference images live in the private batch-references bucket.

create table public.batch_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  mix jsonb not null,
  style_note text not null default '',
  reference_urls jsonb not null default '[]'::jsonb,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_jobs_status check (status = 'ready'),
  constraint batch_jobs_range check (ends_on >= starts_on and ends_on <= starts_on + 61),
  constraint batch_jobs_style_length check (char_length(style_note) <= 2000),
  constraint batch_jobs_mix check (
    jsonb_typeof(mix) = 'object'
    and (mix - 'Carousel' - 'Post' - 'Reel') = '{}'::jsonb
    and jsonb_typeof(mix->'Carousel') = 'number'
    and jsonb_typeof(mix->'Post') = 'number'
    and jsonb_typeof(mix->'Reel') = 'number'
    and (mix->>'Carousel')::numeric between 0 and 7
    and (mix->>'Post')::numeric between 0 and 7
    and (mix->>'Reel')::numeric between 0 and 7
    and (mix->>'Carousel')::numeric = trunc((mix->>'Carousel')::numeric)
    and (mix->>'Post')::numeric = trunc((mix->>'Post')::numeric)
    and (mix->>'Reel')::numeric = trunc((mix->>'Reel')::numeric)
    and (mix->>'Carousel')::numeric + (mix->>'Post')::numeric + (mix->>'Reel')::numeric between 1 and 14
  ),
  constraint batch_jobs_reference_urls check (
    jsonb_typeof(reference_urls) = 'array'
    and jsonb_array_length(reference_urls) <= 8
  )
);

create index batch_jobs_client_created_at_idx
  on public.batch_jobs (client_id, created_at desc);

comment on table public.batch_jobs is
  'One Generate batch for a client. Draft posts and art jobs point here. Members of the studio can read and insert.';

comment on column public.batch_jobs.mix is
  'Posts per week: Carousel, Post (static), and Reel (cover). Each count is 0 to 7.';

comment on column public.batch_jobs.style_note is
  'Free-text look and structure. Up to 2000 characters. Combined with the saved brand when packs are drafted.';

comment on column public.batch_jobs.reference_urls is
  'Optional https links, up to 8, whose look the batch should follow.';

comment on column public.batch_jobs.status is 'ready once the draft posts have been written.';

create or replace function private.batch_jobs_urls_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
begin
  for item in
    select value from jsonb_array_elements(new.reference_urls)
  loop
    if jsonb_typeof(item) <> 'string'
      or char_length(item #>> '{}') < 8
      or char_length(item #>> '{}') > 500 then
      raise exception 'Each reference link must be a short URL.';
    end if;
  end loop;
  return new;
end;
$$;

create trigger batch_jobs_urls_guard
before insert or update on public.batch_jobs
for each row execute function private.batch_jobs_urls_guard();

create trigger batch_jobs_set_updated_at
before update on public.batch_jobs
for each row execute function private.set_updated_at();

revoke all on function private.batch_jobs_urls_guard() from public, anon, authenticated;

alter table public.batch_jobs enable row level security;

create policy batch_jobs_select_member
on public.batch_jobs
for select
to authenticated
using (private.can_access_client(client_id));

create policy batch_jobs_insert_member
on public.batch_jobs
for insert
to authenticated
with check (
  private.can_access_client(client_id)
  and created_by = (select auth.uid())
  and agency_id = (
    select clients.agency_id
    from public.clients as clients
    where clients.id = client_id
  )
);

create policy batch_jobs_delete_member
on public.batch_jobs
for delete
to authenticated
using (private.can_access_client(client_id));

revoke all on table public.batch_jobs from anon, authenticated;
grant select, insert, delete on table public.batch_jobs to authenticated;

-- Reference images for a batch. Private bucket. Not pack slots.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'batch-references',
  'batch-references',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.batch_references (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batch_jobs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint batch_references_mime check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint batch_references_byte_size check (byte_size between 1 and 10485760),
  constraint batch_references_path_length check (char_length(storage_path) between 1 and 400),
  constraint batch_references_path_unique unique (storage_path)
);

create index batch_references_batch_id_idx on public.batch_references (batch_id);

comment on table public.batch_references is
  'Style reference images for one batch. Files live in the private batch-references bucket.';

create or replace function private.batch_references_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_client uuid;
  agency uuid;
  expected_prefix text;
begin
  select batch_jobs.client_id, batch_jobs.agency_id
  into batch_client, agency
  from public.batch_jobs as batch_jobs
  where batch_jobs.id = new.batch_id;

  if batch_client is null then
    raise exception 'That batch is not on this studio.';
  end if;

  if new.client_id is distinct from batch_client then
    raise exception 'That reference does not belong to this client.';
  end if;

  expected_prefix := agency::text || '/' || batch_client::text || '/' || new.batch_id::text || '/';
  if position(expected_prefix in new.storage_path) <> 1 then
    raise exception 'That reference path is not valid.';
  end if;

  if (
    select count(*)
    from public.batch_references
    where batch_id = new.batch_id
      and id is distinct from new.id
  ) >= 4 then
    raise exception 'A batch can have at most 4 reference images.';
  end if;

  return new;
end;
$$;

create trigger batch_references_guard
before insert or update on public.batch_references
for each row execute function private.batch_references_guard();

create or replace function private.delete_batch_reference_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects
  where bucket_id = 'batch-references'
    and name = old.storage_path;
  return old;
exception
  when others then
    raise warning 'batch reference object was not removed: %', sqlerrm;
    return old;
end;
$$;

create trigger batch_references_delete_object
after delete on public.batch_references
for each row execute function private.delete_batch_reference_object();

create or replace function private.batch_reference_object_allowed(object_name text)
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
  batch_id uuid;
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
  batch_id := parts[3]::uuid;

  return exists (
    select 1
    from public.batch_jobs as batch_jobs
    where batch_jobs.id = batch_id
      and batch_jobs.client_id = client_id
      and batch_jobs.agency_id = agency_id
      and private.is_agency_member(agency_id)
  );
end;
$$;

revoke all on function private.batch_references_guard() from public, anon, authenticated;
revoke all on function private.delete_batch_reference_object() from public, anon, authenticated;
revoke all on function private.batch_reference_object_allowed(text) from public, anon, authenticated;
grant execute on function private.batch_reference_object_allowed(text) to authenticated;

alter table public.batch_references enable row level security;

create policy batch_references_select_member
on public.batch_references
for select
to authenticated
using (private.can_access_client(client_id));

create policy batch_references_insert_member
on public.batch_references
for insert
to authenticated
with check (
  private.can_access_client(client_id)
  and exists (
    select 1
    from public.batch_jobs as batch_jobs
    where batch_jobs.id = batch_id
      and batch_jobs.client_id = batch_references.client_id
  )
);

create policy batch_references_delete_member
on public.batch_references
for delete
to authenticated
using (private.can_access_client(client_id));

revoke all on table public.batch_references from anon, authenticated;
grant select, insert, delete on table public.batch_references to authenticated;

create policy batch_reference_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'batch-references'
  and private.batch_reference_object_allowed(name)
);

create policy batch_reference_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'batch-references'
  and private.batch_reference_object_allowed(name)
);

create policy batch_reference_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'batch-references'
  and private.batch_reference_object_allowed(name)
)
with check (
  bucket_id = 'batch-references'
  and private.batch_reference_object_allowed(name)
);

create policy batch_reference_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'batch-references'
  and private.batch_reference_object_allowed(name)
);

create table public.batch_revisions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batch_jobs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  note text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint batch_revisions_note_length check (char_length(btrim(note)) between 1 and 2000)
);

create index batch_revisions_batch_created_at_idx
  on public.batch_revisions (batch_id, created_at desc);

comment on table public.batch_revisions is
  'A change request for one pack or, when post_id is null, the whole batch.';

comment on column public.batch_revisions.post_id is
  'Null revises every post in the batch. Set revises that pack only.';

create or replace function private.batch_revisions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_client uuid;
begin
  select batch_jobs.client_id
  into batch_client
  from public.batch_jobs as batch_jobs
  where batch_jobs.id = new.batch_id;

  if batch_client is null or batch_client is distinct from new.client_id then
    raise exception 'That revision does not belong to this batch.';
  end if;

  if new.post_id is not null and not exists (
    select 1
    from public.posts as posts
    where posts.id = new.post_id
      and posts.client_id = new.client_id
      and posts.batch_id = new.batch_id
  ) then
    raise exception 'That post is not in this batch.';
  end if;

  return new;
end;
$$;

create trigger batch_revisions_guard
before insert or update on public.batch_revisions
for each row execute function private.batch_revisions_guard();

revoke all on function private.batch_revisions_guard() from public, anon, authenticated;

alter table public.batch_revisions enable row level security;

create policy batch_revisions_select_member
on public.batch_revisions
for select
to authenticated
using (private.can_access_client(client_id));

create policy batch_revisions_insert_member
on public.batch_revisions
for insert
to authenticated
with check (
  private.can_access_client(client_id)
  and created_by = (select auth.uid())
);

revoke all on table public.batch_revisions from anon, authenticated;
grant select, insert on table public.batch_revisions to authenticated;

alter table public.posts
  add column batch_id uuid references public.batch_jobs (id) on delete set null;

create index posts_batch_id_idx on public.posts (batch_id) where batch_id is not null;

comment on column public.posts.batch_id is
  'Set when Generate batch created this post. Null for a post added by hand.';

create or replace function private.posts_batch_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.batch_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.batch_jobs as batch_jobs
    where batch_jobs.id = new.batch_id
      and batch_jobs.client_id = new.client_id
  ) then
    raise exception 'That post does not belong to this batch.';
  end if;

  return new;
end;
$$;

create trigger posts_batch_guard
before insert or update on public.posts
for each row execute function private.posts_batch_guard();

revoke all on function private.posts_batch_guard() from public, anon, authenticated;

alter table public.art_jobs
  add column batch_id uuid references public.batch_jobs (id) on delete set null,
  add column hold_media boolean not null default false;

create index art_jobs_batch_id_idx on public.art_jobs (batch_id) where batch_id is not null;

comment on column public.art_jobs.batch_id is
  'Set when this image job was queued for a Generate batch or a revision of one.';

comment on column public.art_jobs.hold_media is
  'True when DOT should draw a new set and the current images stay until the studio accepts them.';

create or replace function private.art_jobs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_client uuid;
  client_agency uuid;
begin
  select posts.client_id
  into post_client
  from public.posts as posts
  where posts.id = new.post_id;

  if post_client is null or post_client is distinct from new.client_id then
    raise exception 'That art job does not belong to this post.';
  end if;

  select clients.agency_id
  into client_agency
  from public.clients as clients
  where clients.id = new.client_id;

  if client_agency is null or client_agency is distinct from new.agency_id then
    raise exception 'That art job does not belong to this studio.';
  end if;

  if new.batch_id is not null and not exists (
    select 1
    from public.batch_jobs as batch_jobs
    where batch_jobs.id = new.batch_id
      and batch_jobs.client_id = new.client_id
      and batch_jobs.agency_id = new.agency_id
  ) then
    raise exception 'That art job does not belong to this batch.';
  end if;

  return new;
end;
$$;

-- Images waiting for accept/replace. Same private post-media bucket and paths.
create table public.art_pending_media (
  id uuid primary key default gen_random_uuid(),
  art_job_id uuid not null references public.art_jobs (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null,
  position integer not null,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint art_pending_media_kind check (kind in ('carousel', 'static', 'cover')),
  constraint art_pending_media_position check (
    (kind = 'carousel' and position between 0 and 9)
    or (kind in ('static', 'cover') and position = 0)
  ),
  constraint art_pending_media_mime check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint art_pending_media_byte_size check (byte_size between 1 and 10485760),
  constraint art_pending_media_path_length check (char_length(storage_path) between 1 and 400),
  constraint art_pending_media_path_unique unique (storage_path),
  constraint art_pending_media_slot_unique unique (post_id, kind, position)
);

create index art_pending_media_post_id_idx on public.art_pending_media (post_id, kind, position);

comment on table public.art_pending_media is
  'DOT images for a held art job. They are not on the pack until someone accepts them.';

create or replace function private.delete_art_pending_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.post_media as media
    where media.storage_path = old.storage_path
  ) then
    return old;
  end if;

  delete from storage.objects
  where bucket_id = 'post-media'
    and name = old.storage_path;
  return old;
exception
  when others then
    raise warning 'pending art object was not removed: %', sqlerrm;
    return old;
end;
$$;

create trigger art_pending_media_delete_object
after delete on public.art_pending_media
for each row execute function private.delete_art_pending_object();

revoke all on function private.delete_art_pending_object() from public, anon, authenticated;

alter table public.art_pending_media enable row level security;

create policy art_pending_media_select_member
on public.art_pending_media
for select
to authenticated
using (private.can_access_client(client_id));

create policy art_pending_media_delete_member
on public.art_pending_media
for delete
to authenticated
using (private.can_access_client(client_id));

revoke all on table public.art_pending_media from anon, authenticated;
grant select, delete on table public.art_pending_media to authenticated;

-- Same signature as before. When hold_media is true, images go to
-- art_pending_media and the live slots stay. Service role only.
create or replace function public.complete_dot_art_job(
  target_job_id uuid,
  target_kind text,
  rows jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_status text;
  job_post uuid;
  job_client uuid;
  job_replace boolean;
  job_hold boolean;
  item jsonb;
  media_id uuid;
  pos integer;
  path text;
  mime text;
  bytes integer;
begin
  select
    status,
    post_id,
    client_id,
    replace_media,
    hold_media
  into
    job_status,
    job_post,
    job_client,
    job_replace,
    job_hold
  from public.art_jobs
  where id = target_job_id
  for update;

  if job_status is null then
    raise exception 'That art job was not found.';
  end if;

  if job_status in ('done', 'failed') then
    raise exception 'This art job is already finished.';
  end if;

  if target_kind not in ('carousel', 'static', 'cover') then
    raise exception 'Choose an image slot.';
  end if;

  if rows is null
    or jsonb_typeof(rows) <> 'array'
    or jsonb_array_length(rows) < 1
    or jsonb_array_length(rows) > 10 then
    raise exception 'Send between 1 and 10 images.';
  end if;

  if job_hold then
    delete from public.art_pending_media
    where post_id = job_post
      and client_id = job_client
      and kind = target_kind;

    for item in
      select value from jsonb_array_elements(rows)
    loop
      media_id := (item->>'id')::uuid;
      pos := (item->>'position')::integer;
      path := item->>'storage_path';
      mime := item->>'mime_type';
      bytes := (item->>'byte_size')::integer;

      if path is null or mime is null or bytes is null or pos is null then
        raise exception 'That image could not be saved.';
      end if;

      insert into public.art_pending_media (
        id,
        art_job_id,
        post_id,
        client_id,
        kind,
        position,
        storage_path,
        mime_type,
        byte_size
      ) values (
        media_id,
        target_job_id,
        job_post,
        job_client,
        target_kind,
        pos,
        path,
        mime,
        bytes
      );
    end loop;
  else
    if job_replace then
      delete from public.post_media
      where post_id = job_post
        and client_id = job_client
        and kind = target_kind;
    end if;

    for item in
      select value from jsonb_array_elements(rows)
    loop
      media_id := (item->>'id')::uuid;
      pos := (item->>'position')::integer;
      path := item->>'storage_path';
      mime := item->>'mime_type';
      bytes := (item->>'byte_size')::integer;

      if path is null or mime is null or bytes is null or pos is null then
        raise exception 'That image could not be saved.';
      end if;

      insert into public.post_media (
        id,
        post_id,
        client_id,
        kind,
        position,
        storage_path,
        mime_type,
        byte_size,
        source
      ) values (
        media_id,
        job_post,
        job_client,
        target_kind,
        pos,
        path,
        mime,
        bytes,
        'dot'
      );
    end loop;
  end if;

  update public.art_jobs
  set status = 'done',
      error = null
  where id = target_job_id;
end;
$$;

comment on function public.complete_dot_art_job(uuid, text, jsonb) is
  'DOT callback only. Writes pack images, or pending images when the job is held, and sets the job done. Service role. Not granted to signed-in members.';

create or replace function public.accept_pending_art(target_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_post uuid;
  job_client uuid;
  job_status text;
  job_hold boolean;
  pending_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in.';
  end if;

  select post_id, client_id, status, hold_media
  into job_post, job_client, job_status, job_hold
  from public.art_jobs
  where id = target_job_id;

  if job_post is null then
    raise exception 'That art job was not found.';
  end if;

  if not private.can_access_client(job_client) then
    raise exception 'You cannot edit images for this client.';
  end if;

  if job_status is distinct from 'done' or job_hold is not true then
    raise exception 'There are no new images to accept.';
  end if;

  select kind
  into pending_kind
  from public.art_pending_media
  where art_job_id = target_job_id
  limit 1;

  if pending_kind is null then
    raise exception 'There are no new images to accept.';
  end if;

  delete from public.post_media
  where post_id = job_post
    and client_id = job_client
    and kind = pending_kind
    and position in (
      select pending.position
      from public.art_pending_media as pending
      where pending.art_job_id = target_job_id
    );

  insert into public.post_media (
    id,
    post_id,
    client_id,
    kind,
    position,
    storage_path,
    mime_type,
    byte_size,
    source
  )
  select
    pending.id,
    pending.post_id,
    pending.client_id,
    pending.kind,
    pending.position,
    pending.storage_path,
    pending.mime_type,
    pending.byte_size,
    'dot'
  from public.art_pending_media as pending
  where pending.art_job_id = target_job_id;

  delete from public.art_pending_media
  where art_job_id = target_job_id;
end;
$$;

create or replace function public.discard_pending_art(target_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_client uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in.';
  end if;

  select client_id
  into job_client
  from public.art_jobs
  where id = target_job_id;

  if job_client is null then
    raise exception 'That art job was not found.';
  end if;

  if not private.can_access_client(job_client) then
    raise exception 'You cannot edit images for this client.';
  end if;

  if not exists (
    select 1
    from public.art_pending_media
    where art_job_id = target_job_id
  ) then
    raise exception 'There are no new images to discard.';
  end if;

  delete from public.art_pending_media
  where art_job_id = target_job_id;
end;
$$;

revoke all on function public.accept_pending_art(uuid) from public, anon, authenticated;
revoke all on function public.discard_pending_art(uuid) from public, anon, authenticated;
grant execute on function public.accept_pending_art(uuid) to authenticated;
grant execute on function public.discard_pending_art(uuid) to authenticated;

comment on function public.accept_pending_art(uuid) is
  'Moves held DOT images onto the pack and removes the previous images of that kind.';

comment on function public.discard_pending_art(uuid) is
  'Deletes held DOT images and leaves the current pack images in place.';

-- The DOT callback uses the service role. Studio pages do not.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on table public.batch_jobs to service_role;
    grant select on table public.batch_references to service_role;
    grant select, insert, delete on table public.art_pending_media to service_role;
  end if;
end;
$$;
