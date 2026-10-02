import assert from "node:assert/strict";
import test from "node:test";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { decideDotConsent, dotConsentDetailsAllowed, dotConsentRedirectAllowed, readDotConsent, readDotConsentConfig } from "@/lib/dot-consent";

const owner = "11111111-1111-4111-8111-111111111111", clientId = "22222222-2222-4222-8222-222222222222";
const env = { DOT_MCP_ENABLED: "true", DOT_MCP_CONSENT_ENABLED: "true", DOT_MCP_ORIGIN: "https://studio.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
  DOT_MCP_OWNER_USER_ID: owner, DOT_MCP_CLIENT_IDS: clientId,
  DOT_MCP_FILE_RULES: '[{"origin":"https://files.example","path_prefix":"/generated/"}]',
  DOT_MCP_REDIRECT_URIS: '["https://chatgpt.com/connector/oauth/fixture-callback"]' };
const config = readDotConsentConfig(env)!;
const details: OAuthAuthorizationDetails = { authorization_id: "fixture-authorization", redirect_uri: config.redirectUris[0],
  client: { id: clientId, name: "Fixture client", uri: "", logo_uri: "" }, user: { id: owner, email: "owner@example.test" }, scope: "openid email" };

test("consent requires both activation gates and an exact HTTPS callback allowlist", () => {
  assert.equal(readDotConsentConfig({}), null);
  assert.equal(readDotConsentConfig({ ...env, DOT_MCP_ENABLED: "false" }), null);
  assert.equal(readDotConsentConfig({ ...env, DOT_MCP_CONSENT_ENABLED: "false" }), null);
  assert.equal(readDotConsentConfig({ ...env, DOT_MCP_REDIRECT_URIS: '["http://localhost/callback"]' }), null);
  assert.equal(dotConsentDetailsAllowed(details, config, details.authorization_id), true);
  assert.equal(dotConsentDetailsAllowed({ ...details, scope: "email" }, config, details.authorization_id), false);
  assert.equal(dotConsentDetailsAllowed({ ...details, scope: "openid admin" }, config, details.authorization_id), false);
  assert.equal(dotConsentDetailsAllowed({ ...details, client: { ...details.client, id: owner } }, config, details.authorization_id), false);
  assert.equal(dotConsentDetailsAllowed({ ...details, redirect_uri: "https://evil.example/callback" }, config, details.authorization_id), false);
});
test("consent result redirects stay on the exact registered callback", () => {
  assert.equal(dotConsentRedirectAllowed(`${details.redirect_uri}?code=fixture&state=fixture`, config), true);
  for (const url of ["https://evil.example/callback?code=fixture", `${details.redirect_uri}/other?code=fixture`,
    `${details.redirect_uri}?next=https://evil.example`, `${details.redirect_uri}#fragment`, "javascript:alert(1)"]) {
    assert.equal(dotConsentRedirectAllowed(url, config), false);
  }
});
test("consent action rechecks current owner and trusted request details before approve or deny", async () => {
  let currentOwner = owner, data: unknown = details, reads = 0, approvals = 0, denials = 0;
  const mock = { auth: { getUser: async () => { reads++; return { data: { user: { id: currentOwner } }, error: null }; }, oauth: {
    getAuthorizationDetails: async () => ({ data, error: null }),
    approveAuthorization: async () => { approvals++; return { data: { redirect_url: `${details.redirect_uri}?code=fixture` }, error: null }; },
    denyAuthorization: async () => { denials++; return { data: { redirect_url: `${details.redirect_uri}?error=access_denied` }, error: null }; },
  } } } as never;
  assert.equal(await readDotConsent(mock, null, details.authorization_id), null); assert.equal(reads, 0);
  currentOwner = clientId; assert.equal(await decideDotConsent(mock, config, details.authorization_id, "approve"), null); assert.equal(approvals, 0);
  currentOwner = owner; data = { redirect_url: `${details.redirect_uri}?code=fixture` };
  assert.equal(await decideDotConsent(mock, config, details.authorization_id, "approve"), null); assert.equal(approvals, 0);
  data = { ...details, scope: "openid admin" };
  assert.equal(await decideDotConsent(mock, config, details.authorization_id, "approve"), null); assert.equal(approvals, 0);
  data = details;
  assert.match((await decideDotConsent(mock, config, details.authorization_id, "approve"))!, /code=fixture/);
  assert.match((await decideDotConsent(mock, config, details.authorization_id, "deny"))!, /access_denied/);
  assert.equal(approvals, 1); assert.equal(denials, 1);
});

test("consent without file rules retains owner client and exact redirect checks", () => {
  for (const value of [undefined, "", "[]"]) {
    const noFiles = readDotConsentConfig({ ...env, DOT_MCP_FILE_RULES: value })!;
    assert.deepEqual(noFiles.fileRules, []);
    assert.equal(dotConsentDetailsAllowed(details, noFiles, details.authorization_id), true);
    assert.equal(dotConsentDetailsAllowed({ ...details, user: { ...details.user, id: clientId } }, noFiles, details.authorization_id), false);
    assert.equal(dotConsentDetailsAllowed({ ...details, redirect_uri: "https://evil.example/callback" }, noFiles, details.authorization_id), false);
  }
});
