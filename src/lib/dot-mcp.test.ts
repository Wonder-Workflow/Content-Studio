import assert from "node:assert/strict";
import test from "node:test";
import { authenticateDotMcp, dotMcpClaimsAllowed } from "@/lib/dot-mcp-auth";
import { readDotMcpConfig, dotMcpResourceMetadata } from "@/lib/dot-mcp-config";
import { approvedDotFileUrl, collectDotFileImages, publicDotAddress } from "@/lib/dot-mcp-files";
import { DOT_CLOUD_TOOLS, handleDotMcp, dotMcpDependencies } from "@/lib/dot-mcp";

const owner = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
const config = readDotMcpConfig({ DOT_MCP_ENABLED: "true", DOT_MCP_ORIGIN: "https://studio.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
  DOT_MCP_OWNER_USER_ID: owner, DOT_MCP_CLIENT_IDS: client,
  DOT_MCP_FILE_RULES: JSON.stringify([{ origin: "https://files.example", path_prefix: "/generated/" }]) })!;
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const ref = { download_url: "https://files.example/generated/image?signature=fixture", file_id: "fixture-file" };
test("cloud configuration and discovery fail closed", () => {
  assert.equal(readDotMcpConfig({}), null);
  assert.equal(readDotMcpConfig({ DOT_MCP_ENABLED: "true" }), null);
  assert.equal(dotMcpResourceMetadata(config).resource, "https://studio.example/api/dot/mcp");
});
test("verified claims require owner, client, resource audience, scope and valid time", () => {
  const claims = { iss: config.issuer, aud: config.resource, sub: owner, role: "authenticated", client_id: client,
    session_id: token, exp: 200, iat: 50, scope: "openid" };
  assert.equal(dotMcpClaimsAllowed(claims, config, 100), true);
  assert.equal(dotMcpClaimsAllowed({ ...claims, aud: "authenticated", resource: config.resource }, config, 100), true);
  assert.equal(dotMcpClaimsAllowed({ ...claims, resource: "https://wrong.example/api/dot/mcp" }, config, 100), false);
  assert.equal(dotMcpClaimsAllowed({ ...claims, aud: "authenticated", resource: "https://wrong.example/api/dot/mcp" }, config, 100), false);
  for (const change of [{ aud: "authenticated" }, { scope: "" }, { sub: client }, { client_id: owner },
    { iss: "https://wrong.example" }, { exp: 99 }, { iat: 101 }, { nbf: 101 }, { is_anonymous: true }]) {
    assert.equal(dotMcpClaimsAllowed({ ...claims, ...change }, config, 100), false);
  }
});
test("authentication requires successful signature verification and a current owner user", async () => {
  const claims = { iss: config.issuer, aud: config.resource, sub: owner, role: "authenticated", client_id: client,
    session_id: token, exp: Date.now() / 1000 + 100, iat: Date.now() / 1000 - 10, scope: "openid" };
  let verificationError = false; let algorithm = "RS256"; let userId = owner; let userCalls = 0;
  const makeClient = () => ({ auth: {
    getClaims: async () => ({ data: { claims, header: { alg: algorithm } }, error: verificationError ? new Error("fixture") : null }),
    getUser: async () => { userCalls++; return { data: { user: { id: userId } }, error: null }; },
  } }) as never;
  const req = new Request(config.resource, { headers: { Authorization: "Bearer fixture.header.signature" } });
  assert.equal((await authenticateDotMcp(req, config, makeClient))?.ownerId, owner);
  verificationError = true; assert.equal(await authenticateDotMcp(req, config, makeClient), null); assert.equal(userCalls, 1);
  verificationError = false; algorithm = "HS256"; assert.equal(await authenticateDotMcp(req, config, makeClient), null);
  algorithm = "RS256"; userId = client; assert.equal(await authenticateDotMcp(req, config, makeClient), null);
});
test("host references reject arbitrary URLs and private/reserved DNS answers", async () => {
  for (const url of ["https://evil.example/generated/x", "https://files.example/other/x", "https://files.example/generated/%2fsecret",
    "http://files.example/generated/x", "https://user:password@files.example/generated/x", "https://127.0.0.1/generated/x"]) {
    assert.equal(approvedDotFileUrl(url, config.fileRules), null);
  }
  for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "198.18.0.1", "192.0.2.1", "::1"]) assert.equal(publicDotAddress(ip), false);
  assert.equal(publicDotAddress("8.8.8.8"), true);
  let calls = 0;
  await assert.rejects(collectDotFileImages([{ ...ref, download_url: "https://evil.example/x" }], config.fileRules,
    async () => { calls++; return png; }));
  assert.equal(calls, 0);
  assert.deepEqual(await collectDotFileImages([ref], config.fileRules, async () => png), [{ base64: png.toString("base64") }]);
  await assert.rejects(collectDotFileImages([{ ...ref, mime_type: "image/jpeg" }], config.fileRules, async () => png));
  await assert.rejects(collectDotFileImages([ref], config.fileRules, async () => Buffer.alloc(2_900_001)));
});
test("host file schema declares all supported fields and OAuth on every tool", () => {
  for (const tool of DOT_CLOUD_TOOLS) assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
  const complete = DOT_CLOUD_TOOLS.find((tool) => tool.name === "art_job_complete")!;
  assert.deepEqual(complete._meta["openai/fileParams"], ["images"]);
  const images = complete.inputSchema.properties.images as { items: { properties: object; required: string[] } };
  assert.deepEqual(Object.keys(images.items.properties), ["download_url", "file_id", "mime_type", "file_name"]);
  assert.deepEqual(images.items.required, ["download_url", "file_id"]);
});

function request(method: string, params: unknown = {}) {
  return new Request(config.resource, { method: "POST", headers: { "Content-Type": "application/json",
    Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
test("stateless HTTP MCP lists tools and challenges unauthenticated requests", async () => {
  assert.equal((await handleDotMcp(request("tools/list"), null)).status, 503);
  const denied = await handleDotMcp(request("tools/list"), config, { ...dotMcpDependencies, authenticate: async () => null });
  assert.equal(denied.status, 401); assert.match(denied.headers.get("www-authenticate")!, /resource_metadata/);
  const deps = { ...dotMcpDependencies, authenticate: async () => ({ ownerId: owner, client: {} as never }) };
  const response = await handleDotMcp(request("tools/list"), config, deps);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.tools.length, 5);
});
test("owner and complete-set lease checks precede downloads; interrupted transfer retries stable bytes", async () => {
  let downloads = 0; const bodies: Record<string, unknown>[] = [];
  let job: Awaited<ReturnType<typeof dotMcpDependencies.ownedJob>> = null;
  let interrupted = false;
  const deps = { ...dotMcpDependencies,
    authenticate: async () => ({ ownerId: owner, client: {} as never }), ownedJob: async () => job,
    images: async () => { downloads++; if (interrupted) throw new Error("fixture interruption"); return [{ base64: png.toString("base64") }]; },
    invoke: async (_name: unknown, _id: string, body: Record<string, unknown>) => { bodies.push(body); return Response.json({ status: "done", media: ["original-id"] }); } };
  const call = (images = [ref]) => request("tools/call", { name: "art_job_complete", arguments: { job_id: owner, lease_token: token, images } });
  assert.equal((await (await handleDotMcp(call(), config, deps)).json()).result.isError, true);
  job = { id: owner, status: "processing", leaseToken: client, leaseExpiresAt: new Date(Date.now() + 60000).toISOString(), expectedPositions: [1] };
  await handleDotMcp(call(), config, deps); assert.equal(downloads, 0);
  job.leaseToken = token; job.expectedPositions = [1, 2]; await handleDotMcp(call(), config, deps); assert.equal(downloads, 0);
  job.expectedPositions = [1]; interrupted = true; await handleDotMcp(call(), config, deps); assert.equal(bodies.length, 0);
  interrupted = false; await handleDotMcp(call(), config, deps); job.status = "done";
  await handleDotMcp(call([{ ...ref, download_url: `${ref.download_url}refreshed` }]), config, deps);
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
});

test("public discovery bootstraps without client IDs while job tools remain unavailable", async () => {
  const { readDotMcpDiscovery, dotMcpChallenge } = await import("@/lib/dot-mcp-config");
  const env = { DOT_MCP_DISCOVERY_ENABLED: "true", DOT_MCP_ORIGIN: "https://studio.example", NEXT_PUBLIC_SUPABASE_URL: "https://project.example" };
  const discovery = readDotMcpDiscovery(env)!;
  assert.equal(readDotMcpDiscovery({}), null);
  assert.equal(readDotMcpConfig(env), null);
  assert.equal(dotMcpResourceMetadata(discovery).authorization_servers[0], "https://project.example/auth/v1");
  assert.match(dotMcpChallenge(discovery), /resource_metadata="https:\/\/studio.example\/.well-known\/oauth-protected-resource"/);
  const { POST } = await import("../app/api/dot/mcp/route.ts");
  const names = ["DOT_MCP_DISCOVERY_ENABLED", "DOT_MCP_ENABLED", "DOT_MCP_ORIGIN", "NEXT_PUBLIC_SUPABASE_URL"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    Object.assign(process.env, env, { DOT_MCP_ENABLED: "false" });
    const response = await POST(new Request(discovery.resource, { method: "POST", body: JSON.stringify({ method: "tools/call", params: { name: "art_job_complete" } }) }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("WWW-Authenticate")!, /resource_metadata=/);
    assert.deepEqual(await response.json(), { error: "OAuth setup is required; job tools remain disabled" });
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});
