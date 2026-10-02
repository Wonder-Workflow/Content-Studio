import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { authenticateDotMcp, loadOwnedDotJob } from "@/lib/dot-mcp-auth";
import { collectDotFileImages } from "@/lib/dot-mcp-files";
import { dotMcpChallenge, DOT_MCP_SCOPE, type DotMcpConfig } from "@/lib/dot-mcp-config";
import { getDotArtJob, claimDotArtJob, completeDotArtJob, failDotArtJob } from "@/lib/art-callback";
import { readArtCallbackSecret } from "@/lib/art-auth";

const uuid = z.string().uuid();
const base = { job_id: uuid };
const lease = { ...base, lease_token: uuid };
const file = z.object({ download_url: z.string().max(8000), file_id: z.string().min(1).max(256),
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(), file_name: z.string().max(256).optional() }).strict();
const validators = {
  art_job_status: z.object(base).strict(), art_job_claim: z.object(lease).strict(), art_job_renew: z.object(lease).strict(),
  art_job_complete: z.object({ ...lease, images: z.array(file).min(1).max(10) }).strict(),
  art_job_fail: z.object({ ...lease, error: z.string().min(1).max(1000), retryable: z.boolean() }).strict(),
};
type ToolName = keyof typeof validators;
const idProperty = { type: "string", format: "uuid" };
const securitySchemes = [{ type: "oauth2", scopes: [DOT_MCP_SCOPE] }];
export const DOT_CLOUD_TOOLS = Object.keys(validators).map((name) => {
  const complete = name === "art_job_complete";
  const status = name === "art_job_status";
  const properties: Record<string, unknown> = { job_id: idProperty };
  const required = ["job_id"];
  if (!status) { properties.lease_token = idProperty; required.push("lease_token"); }
  if (complete) {
    properties.images = { type: "array", minItems: 1, maxItems: 10, items: { type: "object", additionalProperties: false,
      properties: { download_url: { type: "string", maxLength: 8000 }, file_id: { type: "string", minLength: 1, maxLength: 256 },
        mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] }, file_name: { type: "string", maxLength: 256 } },
      required: ["download_url", "file_id"] } }; required.push("images");
  }
  if (name === "art_job_fail") { properties.error = { type: "string", minLength: 1, maxLength: 1000 }; properties.retryable = { type: "boolean" }; required.push("error", "retryable"); }
  return { name, description: status ? "Read an owned art job without claiming it." : complete
    ? "Finalize the entire expected ordered image set using real host-supplied generated-file references. Never invent URLs or file IDs."
    : name === "art_job_claim" ? "Atomically claim an owned job with a fresh UUID worker token; replay the same active token safely."
    : name === "art_job_renew" ? "Renew this worker's active lease before expiry."
    : "Record this worker's failure; retryable failures release a bounded retry.",
    inputSchema: { type: "object" as const, properties, required, additionalProperties: false }, securitySchemes,
    _meta: { securitySchemes, ...(complete ? { "openai/fileParams": ["images"] } : {}) },
    annotations: { readOnlyHint: status, destructiveHint: complete, idempotentHint: name !== "art_job_renew", openWorldHint: complete } };
});

export async function invokeDotCallback(name: ToolName, id: string, body: Record<string, unknown>, config: DotMcpConfig) {
  const secret = readArtCallbackSecret();
  if (!secret) return Response.json({ error: "Internal callback is not configured" }, { status: 503 });
  const request = new Request(`${config.resource}/internal`, { method: name === "art_job_status" ? "GET" : "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    ...(name === "art_job_status" ? {} : { body: JSON.stringify(body) }) });
  if (name === "art_job_status") return getDotArtJob(request, id);
  if (name === "art_job_claim" || name === "art_job_renew") return claimDotArtJob(request, id, name === "art_job_renew");
  if (name === "art_job_complete") return completeDotArtJob(request, id);
  return failDotArtJob(request, id);
}
export const dotMcpDependencies = { authenticate: authenticateDotMcp, ownedJob: loadOwnedDotJob,
  images: collectDotFileImages, invoke: invokeDotCallback };

export async function handleDotMcp(request: Request, config: DotMcpConfig | null, deps = dotMcpDependencies): Promise<Response> {
  if (!config) return Response.json({ error: "Cloud connector is disabled or incomplete" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (new URL(request.url).origin !== config.origin || (origin && origin !== config.origin && origin !== "https://chatgpt.com")) {
    return new Response(null, { status: 403 });
  }
  const auth = await deps.authenticate(request, config);
  if (!auth) return Response.json({ error: "OAuth access token required" }, { status: 401,
    headers: { "WWW-Authenticate": dotMcpChallenge(config), "Cache-Control": "no-store" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  // Bound metadata requests too; binary images arrive through capability references, not this body.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > 64_000) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(next.value);
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const server = new Server({ name: "content-studio-dot", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: DOT_CLOUD_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const validator = validators[params.name as ToolName];
    const result = validator?.safeParse(params.arguments);
    const error = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });
    if (!result?.success) return error("Invalid tool arguments");
    const args = result.data; const name = params.name as ToolName;
    try {
      const job = await deps.ownedJob(auth.client, auth.ownerId, args.job_id);
      if (!job) return error("Owned job is unavailable");
      const body: Record<string, unknown> = { ...args }; delete body.job_id;
      if (name === "art_job_complete") {
        if (!config.fileRules.length) return error("Image delivery is disabled until verified file rules are configured");
        const completion = validators.art_job_complete.parse(params.arguments);
        const expiry = Date.parse(job.leaseExpiresAt ?? "");
        if (job.leaseToken !== completion.lease_token || (job.status !== "done" && (job.status !== "processing"
          || !Number.isFinite(expiry) || expiry <= Date.now()))
          || completion.images.length !== job.expectedPositions?.length) return error("Lease or complete image count does not match");
        body.images = await deps.images(completion.images, config.fileRules);
      }
      const response = await deps.invoke(name, args.job_id, body, config);
      const value = await response.json();
      return { isError: !response.ok, content: [{ type: "text" as const, text: JSON.stringify(value) }] };
    } catch { return error("Operation interrupted; inspect status and retry using the same active lease, or reclaim after expiry"); }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, { parsedBody: parsed });
    response.headers.set("Cache-Control", "no-store"); return response;
  } finally { await server.close(); }
}
