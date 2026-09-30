-- Art jobs for DOT.
--
-- One row is one request to draw images for a single post. Studio inserts
-- queued. This database does not call an image model. If Slack is configured,
-- the app posts the brief to #content. DOT (Slack and/or the ChatGPT plugin)
-- reads the job and calls back with image URLs. The callback writes the
-- private post-media bucket and post_media, then sets the job done or failed.
--
-- source on post_media gains 'dot' next to 'upload'. Same slots, same paths.
-- Manual uploads stay. Video stays out.
--
-- Agency members can select and insert jobs for posts on clients they can
-- access, and they can update those rows so the pack can poll. They cannot
-- delete jobs. complete_dot_art_job is for the service role only.

alter table public.post_media drop constraint post_media_source;

alter table public.post_media
  add constraint post_media_source check (source in ('upload', 'dot'));

comment on table public.post_media is
  'Ordered images for one post. kind is carousel, static, or cover. source is upload or dot.';

comment on column public.post_media.source is
  'upload is a file a person chose. dot is an image DOT returned into an existing slot. Do not add a second board.';

create table public.art_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  brief text,
  replace_media boolean not null default false,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint art_jobs_status check (status in ('queued', 'processing', 'done', 'failed')),
  constraint art_jobs_brief_length check (brief is null or char_length(brief) <= 2000),
  constraint art_jobs_error_length check (error is null or char_length(error) <= 2000)
);

create index art_jobs_post_created_at_idx
  on public.art_jobs (post_id, created_at desc);

create unique index art_jobs_one_open_per_post_idx
  on public.art_jobs (post_id)
  where status in ('queued', 'processing');

comment on table public.art_jobs is
  'One DOT image request for a post. The app inserts queued. DOT sets processing, then done or failed, and writes post_media. Members of the studio can read and update.';

comment on column public.art_jobs.brief is
  'Optional notes the person typed for DOT. The full brief is built from the brand and the pack when the job is read.';

comment on column public.art_jobs.replace_media is
  'True only when every slot for this type was full and the person confirmed replace. False fills empty slots and leaves existing images.';

comment on column public.art_jobs.status is 'queued, processing, done, or failed.';

comment on column public.art_jobs.completed_at is
  'Set when status becomes done or failed. Cleared if status returns to queued or processing.';

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

  return new;
end;
$$;

create trigger art_jobs_guard
before insert or update on public.art_jobs
for each row execute function private.art_jobs_guard();

create or replace function private.art_jobs_set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.status in ('done', 'failed') then
    if new.completed_at is null then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger art_jobs_set_timestamps
before insert or update on public.art_jobs
for each row execute function private.art_jobs_set_timestamps();

revoke all on function private.art_jobs_guard() from public, anon, authenticated;
revoke all on function private.art_jobs_set_timestamps() from public, anon, authenticated;

alter table public.art_jobs enable row level security;

create policy art_jobs_select_member
on public.art_jobs
for select
to authenticated
using (private.can_access_client(client_id));

create policy art_jobs_insert_member
on public.art_jobs
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

create policy art_jobs_update_member
on public.art_jobs
for update
to authenticated
using (private.can_access_client(client_id))
with check (
  private.can_access_client(client_id)
  and agency_id = (
    select clients.agency_id
    from public.clients as clients
    where clients.id = client_id
  )
);

revoke all on table public.art_jobs from anon, authenticated;
grant select, insert, update on table public.art_jobs to authenticated;

-- Saves DOT images and marks the job done in one transaction.
-- Replace deletes the target kind first; a failure rolls that delete back.
-- Only the service role may call this. Studio members keep using upload.
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
    replace_media
  into
    job_status,
    job_post,
    job_client,
    job_replace
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

  update public.art_jobs
  set status = 'done',
      error = null
  where id = target_job_id;
end;
$$;

revoke all on function public.complete_dot_art_job(uuid, text, jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.complete_dot_art_job(uuid, text, jsonb) to service_role;
  end if;
end;
$$;

comment on function public.complete_dot_art_job(uuid, text, jsonb) is
  'DOT callback only. Writes post_media rows for one art job and sets the job done. Service role. Not granted to signed-in members.';
