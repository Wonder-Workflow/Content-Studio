-- Pack body for a calendar post.
-- Hook, title, status, format, platform, and dates stay on the posts columns.
-- shot_list_and_angles, caption, and cta live in pack.
-- Existing posts policies already cover the row, so members of the client's
-- studio can read and write pack and everyone else cannot. No new policies.

alter table public.posts
  add column pack jsonb not null default '{}'::jsonb;

alter table public.posts
  add constraint posts_pack_shape check (
    jsonb_typeof(pack) = 'object'
    and (pack - 'shot_list_and_angles' - 'caption' - 'cta') = '{}'::jsonb
    and (
      not jsonb_exists(pack, 'shot_list_and_angles')
      or jsonb_typeof(pack->'shot_list_and_angles') = 'string'
    )
    and (
      not jsonb_exists(pack, 'caption')
      or jsonb_typeof(pack->'caption') = 'string'
    )
    and (not jsonb_exists(pack, 'cta') or jsonb_typeof(pack->'cta') = 'string')
    and char_length(coalesce(pack->>'shot_list_and_angles', '')) <= 4000
    and char_length(coalesce(pack->>'caption', '')) <= 2200
    and char_length(coalesce(pack->>'cta', '')) <= 300
  );

comment on column public.posts.pack is
  'Pack body: shot_list_and_angles (up to 4000), caption (up to 2200), and cta (up to 300).';
