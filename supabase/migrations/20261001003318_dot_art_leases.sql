-- LOCAL REVIEW ONLY. Apply with the callback release, after explicit approval.
alter table public.art_jobs
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  add column expected_kind text,
  add column expected_positions integer[],
  add column completion_hash text,
  add column completion_result jsonb,
  add column last_failure_token uuid,
  add column last_failure_result jsonb;

-- Members queue/read jobs; only the service callbacks own their lifecycle.
revoke update on public.art_jobs from authenticated;
revoke insert on public.art_jobs from authenticated;
grant insert (client_id, post_id, agency_id, created_by, brief, replace_media,
  batch_id, hold_media, status) on public.art_jobs to authenticated;
alter policy art_jobs_insert_member on public.art_jobs with check (
  private.can_access_client(client_id)
  and created_by = (select auth.uid())
  and status = 'queued'
  and agency_id = (select clients.agency_id from public.clients where clients.id = client_id)
);

create function public.claim_dot_art_job(target_job_id uuid, worker_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.art_jobs;
  post_format text;
  total integer;
  positions integer[];
  job_kind text;
begin
  if worker_token is null then raise exception 'A lease token is required.'; end if;
  select * into job from public.art_jobs where id = target_job_id for update;
  if not found then raise exception 'That art job was not found.'; end if;
  if job.status in ('done', 'failed') then raise exception 'This art job is already finished.'; end if;
  if job.status = 'processing' and job.lease_expires_at > clock_timestamp() then
    if job.lease_token is distinct from worker_token then raise exception 'This art job is already claimed.'; end if;
    return jsonb_build_object('lease_token', job.lease_token, 'lease_expires_at', job.lease_expires_at,
      'attempt_count', job.attempt_count, 'expected_kind', job.expected_kind, 'expected_positions', job.expected_positions);
  end if;
  -- A spent token cannot acquire a new attempt after expiry or release.
  if job.lease_token = worker_token or job.last_failure_token = worker_token then
    raise exception 'That lease expired. Claim with a new token.';
  end if;
  if job.attempt_count >= 3 then
    update public.art_jobs set status = 'failed', error = 'The image job exhausted three attempts.',
      lease_expires_at = null where id = job.id;
    return jsonb_build_object('status', 'failed', 'error', 'The image job exhausted three attempts.');
  end if;
  select format into post_format from public.posts where id = job.post_id for update;
  job_kind := case post_format when 'Carousel' then 'carousel' when 'Reel' then 'cover' else 'static' end;
  total := case post_format when 'Carousel' then 10 else 1 end;
  if job.expected_positions is null then
    select coalesce(array_agg(pos order by pos), '{}'::integer[]) into positions
    from generate_series(0, total - 1) as pos
    where job.hold_media or job.replace_media or not exists (
      select 1 from public.post_media as media where media.post_id = job.post_id
        and media.kind = job_kind and media.position = pos
    );
  else
    positions := job.expected_positions;
    if job_kind is distinct from job.expected_kind then
      update public.art_jobs set status = 'failed', error = 'The pack format changed. Queue a new job.',
        lease_expires_at = null where id = job.id;
      return jsonb_build_object('status', 'failed', 'error', 'The pack format changed. Queue a new job.');
    end if;
  end if;
  if cardinality(positions) = 0 then
    update public.art_jobs set status = 'failed', error = 'Every image slot is already filled.',
      lease_expires_at = null where id = job.id;
    return jsonb_build_object('status', 'failed', 'error', 'Every image slot is already filled.');
  end if;
  update public.art_jobs set status = 'processing', error = null, lease_token = worker_token,
    lease_expires_at = clock_timestamp() + interval '15 minutes', attempt_count = attempt_count + 1,
    expected_kind = job_kind, expected_positions = positions where id = job.id returning * into job;
  return jsonb_build_object('lease_token', job.lease_token, 'lease_expires_at', job.lease_expires_at,
    'attempt_count', job.attempt_count, 'expected_kind', job.expected_kind, 'expected_positions', job.expected_positions);
end;
$$;

create function public.renew_dot_art_job(target_job_id uuid, worker_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job public.art_jobs;
begin
  select * into job from public.art_jobs where id = target_job_id for update;
  if not found then raise exception 'That art job was not found.'; end if;
  if job.status <> 'processing' or job.lease_token is distinct from worker_token
    or job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp() then
    raise exception 'An active matching lease is required.';
  end if;
  update public.art_jobs set lease_expires_at = clock_timestamp() + interval '15 minutes'
    where id = job.id returning * into job;
  return jsonb_build_object('lease_token', job.lease_token, 'lease_expires_at', job.lease_expires_at);
end;
$$;

create function public.fail_dot_art_job(target_job_id uuid, worker_token uuid, reason text, retryable boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job public.art_jobs; result jsonb; next_status text;
begin
  select * into job from public.art_jobs where id = target_job_id for update;
  if not found then raise exception 'That art job was not found.'; end if;
  if job.last_failure_token = worker_token then return job.last_failure_result; end if;
  if job.status <> 'processing' or job.lease_token is distinct from worker_token
    or job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp() then
    raise exception 'An active matching lease is required.';
  end if;
  next_status := case when retryable and job.attempt_count < 3 then 'queued' else 'failed' end;
  result := jsonb_build_object('ok', true, 'job_id', job.id, 'status', next_status, 'attempt_count', job.attempt_count);
  update public.art_jobs set status = next_status, error = left(coalesce(reason, 'Image job failed.'), 2000),
    lease_expires_at = null, last_failure_token = worker_token, last_failure_result = result where id = job.id;
  return result;
end;
$$;

-- Remove the old unleased entry point; clients must explicitly claim first.
-- Preserve the legacy three-argument RPC until all old callbacks are retired.
create function public.complete_dot_art_job_v2(target_job_id uuid, target_kind text, rows jsonb,
  worker_token uuid, request_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.art_jobs;
  item jsonb;
  positions integer[];
  result jsonb;
  post_format text;
begin
  select * into job from public.art_jobs where id = target_job_id for update;
  if not found then raise exception 'That art job was not found.'; end if;
  if job.status = 'done' then
    if job.lease_token = worker_token and job.completion_hash = request_hash then
      return job.completion_result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'This art job is already finished with a different completion.';
  end if;
  if job.status <> 'processing' or job.lease_token is distinct from worker_token
    or job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp() then
    raise exception 'An active matching lease is required.';
  end if;
  if request_hash is null or request_hash !~ '^[0-9a-f]{64}$' then raise exception 'A completion hash is required.'; end if;
  select format into post_format from public.posts where id = job.post_id for update;
  if (case post_format when 'Carousel' then 'carousel' when 'Reel' then 'cover' else 'static' end)
    is distinct from job.expected_kind then raise exception 'The pack format changed. Queue a new job.'; end if;
  if target_kind is distinct from job.expected_kind or rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'Send the full expected image set.';
  end if;
  select array_agg((value->>'position')::integer order by (value->>'position')::integer)
    into positions from jsonb_array_elements(rows);
  if positions is distinct from job.expected_positions then raise exception 'Send the full expected image set.'; end if;
  if job.hold_media then
    delete from public.art_pending_media where post_id = job.post_id and kind = target_kind;
  elsif job.replace_media then
    delete from public.post_media where post_id = job.post_id and kind = target_kind;
  end if;
  for item in select value from jsonb_array_elements(rows) loop
    if job.hold_media then
      insert into public.art_pending_media (id, art_job_id, post_id, client_id, kind, position, storage_path, mime_type, byte_size)
      values ((item->>'id')::uuid, job.id, job.post_id, job.client_id, target_kind,
        (item->>'position')::integer, item->>'storage_path', item->>'mime_type', (item->>'byte_size')::integer);
    else
      insert into public.post_media (id, post_id, client_id, kind, position, storage_path, mime_type, byte_size, source)
      values ((item->>'id')::uuid, job.post_id, job.client_id, target_kind,
        (item->>'position')::integer, item->>'storage_path', item->>'mime_type', (item->>'byte_size')::integer, 'dot');
    end if;
  end loop;
  result := jsonb_build_object('ok', true, 'job_id', job.id, 'status', 'done', 'media',
    (select jsonb_agg(jsonb_build_object('id', value->>'id', 'kind', target_kind, 'position', (value->>'position')::integer))
      from jsonb_array_elements(rows)));
  update public.art_jobs set status = 'done', error = null, completion_hash = request_hash,
    completion_result = result, lease_expires_at = null where id = job.id;
  return result;
end;
$$;

revoke all on function public.claim_dot_art_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.renew_dot_art_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_dot_art_job(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_dot_art_job_v2(uuid, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_dot_art_job(uuid, uuid) to service_role;
grant execute on function public.renew_dot_art_job(uuid, uuid) to service_role;
grant execute on function public.fail_dot_art_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.complete_dot_art_job_v2(uuid, text, jsonb, uuid, text) to service_role;
