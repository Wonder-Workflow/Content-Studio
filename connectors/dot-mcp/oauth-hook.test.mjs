import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111", client = "22222222-2222-4222-8222-222222222222";
const resource = "https://studio.example/api/dot/mcp";
const event = { user_id: owner, claims: { sub: owner, client_id: client, aud: "authenticated", role: "authenticated",
  is_anonymous: false, scope: "openid email", session_id: "fixture", exp: 123, iat: 100 } };
async function fixture(configured) {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role supabase_auth_admin;");
  let sql = await readFile(new URL("../../supabase/templates/dot_mcp_access_token_hook.sql", import.meta.url), "utf8");
  if (configured) sql = sql.replaceAll("<APPROVED_OAUTH_CLIENT_UUID>", client).replaceAll("<APPROVED_OWNER_USER_UUID>", owner).replaceAll("https://<APP_HOST>/api/dot/mcp", resource);
  await db.exec(sql);
  const hook = async (value) => (await db.query("select public.dot_mcp_access_token_hook($1::jsonb) as result", [JSON.stringify(value)])).rows[0].result;
  return { db, hook };
}
test("unconfigured hook template leaves tokens unchanged", async () => {
  const f = await fixture(false); try { assert.deepEqual(await f.hook(event), event); } finally { await f.db.close(); }
});
test("configured hook adds only client/owner-bound resource while preserving Supabase audience and scope", async () => {
  const f = await fixture(true);
  try {
    const result = await f.hook(event);
    assert.deepEqual(result, { ...event, claims: { ...event.claims, resource } });
    for (const modified of [ { ...event, user_id: client }, { ...event, claims: { ...event.claims, sub: client } },
      { ...event, claims: { ...event.claims, client_id: owner } }, { ...event, claims: { ...event.claims, scope: "email" } },
      { ...event, claims: { ...event.claims, scope: undefined } }, { ...event, claims: { ...event.claims, is_anonymous: true } },
      { ...event, client_id: owner } ]) {
      assert.equal((await f.hook(modified)).claims.resource, undefined);
    }
    const refreshed = await f.hook({ ...event, authentication_method: "token_refresh" });
    assert.equal(refreshed.claims.resource, resource);
    const missingScope = { ...event, claims: { ...event.claims, scope: undefined, resource } };
    assert.equal((await f.hook(missingScope)).claims.resource, undefined);
  } finally { await f.db.close(); }
});
test("only Supabase Auth admin can execute the hook", async () => {
  const f = await fixture(true);
  try {
    assert.equal((await f.db.query("select has_function_privilege('authenticated','public.dot_mcp_access_token_hook(jsonb)','execute') as allowed")).rows[0].allowed, false);
    assert.equal((await f.db.query("select has_function_privilege('anon','public.dot_mcp_access_token_hook(jsonb)','execute') as allowed")).rows[0].allowed, false);
    assert.equal((await f.db.query("select has_function_privilege('supabase_auth_admin','public.dot_mcp_access_token_hook(jsonb)','execute') as allowed")).rows[0].allowed, true);
  } finally { await f.db.close(); }
});
