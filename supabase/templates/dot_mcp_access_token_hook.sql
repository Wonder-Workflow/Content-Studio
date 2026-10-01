-- REVIEW TEMPLATE ONLY. Not a migration and not registered as an Auth hook.
-- Replace all placeholders only in an approved isolated project. No HTTP hook,
-- service key or new credential is needed. Preserve existing hooks when combining.
create or replace function public.dot_mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  approved_client constant text := '<APPROVED_OAUTH_CLIENT_UUID>';
  approved_owner constant text := '<APPROVED_OWNER_USER_UUID>';
  mcp_resource constant text := 'https://<APP_HOST>/api/dot/mcp';
  claims jsonb := event->'claims';
begin
  -- Placeholders cannot enable resource binding accidentally.
  if approved_client !~ '^[0-9a-f-]{36}$' or approved_owner !~ '^[0-9a-f-]{36}$'
    or mcp_resource like '%<%' or mcp_resource !~ '^https://[^/]+/api/dot/mcp$'
    or pg_catalog.jsonb_typeof(claims) <> 'object' then return event; end if;
  if claims->>'client_id' = approved_client then
    claims := claims - 'resource';
    -- Never synthesize scopes. A missing signed scope leaves MCP unavailable.
    if claims->>'sub' = approved_owner and event->>'user_id' = approved_owner
      and claims->>'role' = 'authenticated' and claims->>'aud' = 'authenticated'
      and claims->>'is_anonymous' = 'false'
      and (event->>'client_id' is null or event->>'client_id' = approved_client)
      and 'openid' = any(pg_catalog.regexp_split_to_array(claims->>'scope', '\s+')) then
      -- Keep aud=authenticated for Supabase Auth/Data APIs; the signed resource
      -- claim binds this OAuth client to exactly one MCP endpoint.
      claims := pg_catalog.jsonb_set(claims, '{resource}', pg_catalog.to_jsonb(mcp_resource));
    end if;
    return pg_catalog.jsonb_set(event, '{claims}', claims);
  end if;
  return event;
end;
$$;
revoke all on function public.dot_mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.dot_mcp_access_token_hook(jsonb) to supabase_auth_admin;
