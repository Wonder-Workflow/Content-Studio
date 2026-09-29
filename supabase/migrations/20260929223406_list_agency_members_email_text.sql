-- auth.users.email is varchar. list_agency_members declares email as text.
-- RETURN QUERY requires an exact type match, so the studio page crashed for
-- every signed-in member (production showed this as React error #441).

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

revoke all on function private.list_agency_members(uuid) from public, anon, authenticated;
grant execute on function private.list_agency_members(uuid) to authenticated;
