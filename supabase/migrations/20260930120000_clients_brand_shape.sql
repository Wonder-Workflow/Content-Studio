-- Shape for clients.brand, the one brand profile per client.
-- The column already exists (jsonb, not null, default {}). This replaces the
-- object-only check with the keys the Brand panel reads and writes.
-- Studio members already have select and update on clients. No new table
-- or policy.
--
-- Keys, all text:
--   identity.name (80), identity.tagline (160), identity.positioning (400)
--   audience (800)
--   offers (2000)
--   voice.tone (300), voice.caption_pattern (2000)
--   do (2000), dont (2000)
--   visual_notes (2000)
--   phrases (800)
--
-- {} stays valid. A save may include every key, including empty strings.
-- Missing keys are valid. Unknown keys are not.
--
-- Before applying, list anything already stored:
--   select id, name, brand from public.clients where brand <> '{}'::jsonb;
-- Each of those rows must already match this shape. This app did not write
-- brand before this migration. If a row does not match, fix or clear it
-- first (update public.clients set brand = '{}'::jsonb where id = '...').

comment on column public.clients.brand is
  'Per-client brand profile. Optional keys: identity {name (80), tagline (160), positioning (400)}, audience (800), offers (2000), voice {tone (300), caption_pattern (2000)}, do (2000), dont (2000), visual_notes (2000), phrases (800). Text only. {} until the Brand panel is saved.';

alter table public.clients drop constraint clients_brand_object;

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
  );
