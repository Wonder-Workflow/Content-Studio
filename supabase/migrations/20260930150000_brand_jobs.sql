-- Brand pulls, and optional hex colors on clients.brand.
--
-- brand_jobs is the queue. Studio creates a row, then POSTs the job to the
-- Grok Bot webhook (BRAND_BOT_WEBHOOK_URL). The bot is outside this app. It
-- researches the links and writes clients.brand. This database does not call
-- a model vendor.
--
-- The bot updates brand_jobs.status and clients.brand with the Supabase
-- service role (or Supabase MCP on Ian's connection). Service role bypasses
-- RLS. There is no user session on that path.
--
-- Agency members can select and insert jobs for clients they can access, and
-- they can update those rows (including status) so the Brand tab can poll and
-- so a member can debug a stuck job. They cannot delete jobs.
--
-- One open job per client: status queued or processing. A newer regenerate
-- marks the open row failed ("Replaced by a newer pull.") and inserts another.
-- App code also refuses a new pull when any done row exists, unless regenerate
-- is true.
--
-- clients_brand_shape gains an optional colors object. Existing rows stay
-- valid. Pack JSON on posts is unchanged.

comment on column public.clients.brand is
  'Per-client brand profile. Optional keys: identity {name (80), tagline (160), positioning (400)}, audience (800), offers (2000), voice {tone (300), caption_pattern (2000)}, do (2000), dont (2000), visual_notes (2000), phrases (800), colors {primary, secondary, accent, background, text} as #RGB or #RRGGBB. Text only. {} until the Brand panel is saved.';

alter table public.clients drop constraint clients_brand_shape;

alter table public.clients
  add constraint clients_brand_shape check (
    case
      when jsonb_typeof(brand) <> 'object' then false
      when (
        brand
        - 'identity'
        - 'audience'
        - 'offers'
        - 'voice'
        - 'do'
        - 'dont'
        - 'visual_notes'
        - 'phrases'
        - 'colors'
      ) <> '{}'::jsonb then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'identity') then true
      when jsonb_typeof(brand->'identity') <> 'object' then false
      when (brand->'identity') - 'name' - 'tagline' - 'positioning' <> '{}'::jsonb then false
      when jsonb_exists(brand->'identity', 'name')
        and (
          jsonb_typeof(brand->'identity'->'name') <> 'string'
          or char_length(brand->'identity'->>'name') > 80
        ) then false
      when jsonb_exists(brand->'identity', 'tagline')
        and (
          jsonb_typeof(brand->'identity'->'tagline') <> 'string'
          or char_length(brand->'identity'->>'tagline') > 160
        ) then false
      when jsonb_exists(brand->'identity', 'positioning')
        and (
          jsonb_typeof(brand->'identity'->'positioning') <> 'string'
          or char_length(brand->'identity'->>'positioning') > 400
        ) then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'audience') then true
      when jsonb_typeof(brand->'audience') <> 'string' then false
      when char_length(brand->>'audience') > 800 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'offers') then true
      when jsonb_typeof(brand->'offers') <> 'string' then false
      when char_length(brand->>'offers') > 2000 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'voice') then true
      when jsonb_typeof(brand->'voice') <> 'object' then false
      when (brand->'voice') - 'tone' - 'caption_pattern' <> '{}'::jsonb then false
      when jsonb_exists(brand->'voice', 'tone')
        and (
          jsonb_typeof(brand->'voice'->'tone') <> 'string'
          or char_length(brand->'voice'->>'tone') > 300
        ) then false
      when jsonb_exists(brand->'voice', 'caption_pattern')
        and (
          jsonb_typeof(brand->'voice'->'caption_pattern') <> 'string'
          or char_length(brand->'voice'->>'caption_pattern') > 2000
        ) then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'do') then true
      when jsonb_typeof(brand->'do') <> 'string' then false
      when char_length(brand->>'do') > 2000 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'dont') then true
      when jsonb_typeof(brand->'dont') <> 'string' then false
      when char_length(brand->>'dont') > 2000 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'visual_notes') then true
      when jsonb_typeof(brand->'visual_notes') <> 'string' then false
      when char_length(brand->>'visual_notes') > 2000 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'phrases') then true
      when jsonb_typeof(brand->'phrases') <> 'string' then false
      when char_length(brand->>'phrases') > 800 then false
      else true
    end
    and case
      when not jsonb_exists(brand, 'colors') then true
      when jsonb_typeof(brand->'colors') <> 'object' then false
      when (
        (brand->'colors')
        - 'primary'
        - 'secondary'
        - 'accent'
        - 'background'
        - 'text'
      ) <> '{}'::jsonb then false
      when jsonb_exists(brand->'colors', 'primary')
        and (
          jsonb_typeof(brand->'colors'->'primary') <> 'string'
          or (brand->'colors'->>'primary') !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        ) then false
      when jsonb_exists(brand->'colors', 'secondary')
        and (
          jsonb_typeof(brand->'colors'->'secondary') <> 'string'
          or (brand->'colors'->>'secondary') !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        ) then false
      when jsonb_exists(brand->'colors', 'accent')
        and (
          jsonb_typeof(brand->'colors'->'accent') <> 'string'
          or (brand->'colors'->>'accent') !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        ) then false
      when jsonb_exists(brand->'colors', 'background')
        and (
          jsonb_typeof(brand->'colors'->'background') <> 'string'
          or (brand->'colors'->>'background') !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        ) then false
      when jsonb_exists(brand->'colors', 'text')
        and (
          jsonb_typeof(brand->'colors'->'text') <> 'string'
          or (brand->'colors'->>'text') !~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
        ) then false
      else true
    end
  );

create table public.brand_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  website_url text,
  social_urls text[] not null default '{}',
  notes text,
  regenerate boolean not null default false,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint brand_jobs_status check (status in ('queued', 'processing', 'done', 'failed')),
  constraint brand_jobs_website_url_length check (
    website_url is null or char_length(website_url) <= 2000
  ),
  constraint brand_jobs_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint brand_jobs_error_length check (error is null or char_length(error) <= 2000),
  constraint brand_jobs_social_urls_count check (cardinality(social_urls) <= 20)
);

create index brand_jobs_client_created_at_idx
  on public.brand_jobs (client_id, created_at desc);

create unique index brand_jobs_one_open_per_client_idx
  on public.brand_jobs (client_id)
  where status in ('queued', 'processing');

comment on table public.brand_jobs is
  'One brand-from-links pull. The app inserts queued, then wakes the Grok Bot. The bot sets processing, then done or failed, and writes clients.brand. Members of the studio can read and update.';

comment on column public.brand_jobs.status is 'queued, processing, done, or failed.';
comment on column public.brand_jobs.social_urls is 'Social profile URLs, one array entry each. At most 20.';
comment on column public.brand_jobs.regenerate is
  'True when this pull was started after a completed one, or replaced an open pull.';
comment on column public.brand_jobs.completed_at is
  'Set when status becomes done or failed. Cleared if status returns to queued or processing.';

create or replace function private.brand_jobs_set_timestamps()
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

create trigger brand_jobs_set_timestamps
before insert or update on public.brand_jobs
for each row execute function private.brand_jobs_set_timestamps();

revoke all on function private.brand_jobs_set_timestamps() from public, anon, authenticated;

alter table public.brand_jobs enable row level security;

create policy brand_jobs_select_member
on public.brand_jobs
for select
to authenticated
using (private.can_access_client(client_id));

create policy brand_jobs_insert_member
on public.brand_jobs
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

create policy brand_jobs_update_member
on public.brand_jobs
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

revoke all on table public.brand_jobs from anon, authenticated;
grant select, insert, update on table public.brand_jobs to authenticated;
