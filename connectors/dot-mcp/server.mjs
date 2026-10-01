import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDotClient } from "./client.mjs";

const client = createDotClient({
  origin: process.env.DOT_STUDIO_ORIGIN,
  secret: process.env.DOT_ART_CALLBACK_SECRET,
  imageRoot: process.env.DOT_IMAGE_ROOT,
});
const server = new McpServer({ name: "content-studio-dot", version: "0.1.0" });
const job = { job_id: z.string().uuid() };
const lease = { ...job, lease_token: z.string().uuid() };
const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
function tool(name, description, inputSchema, callback, readOnly = false, destructive = false) {
  server.registerTool(name, { description, inputSchema, annotations: { ...annotations, readOnlyHint: readOnly, destructiveHint: destructive } }, async (args) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(await callback(args)) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed" }] };
    }
  });
}
tool("art_job_status", "Read a job and brief without claiming or changing it.", job, ({ job_id }) => client.call(job_id), true);
tool("art_job_claim", "Claim before generating. Choose one UUID token and reuse it on retries. A conflict means another worker owns this job. Do not generate after a conflict.", lease,
  ({ job_id, lease_token }) => client.call(job_id, "claim", { lease_token }));
tool("art_job_renew", "Renew your active 15-minute lease before expiry. An expired lease cannot be renewed.", lease,
  ({ job_id, lease_token }) => client.call(job_id, "renew", { lease_token }));
tool("art_job_complete_files", "Send the entire expected ordered image set from actual local PNG/JPEG/WebP paths returned by an image tool. Never invent paths or encode image bytes yourself. Files must be inside DOT_IMAGE_ROOT. Reuse identical files/order on retry.",
  { ...lease, file_paths: z.array(z.string()).min(1).max(10) }, ({ job_id, lease_token, file_paths }) => client.completeFiles(job_id, lease_token, file_paths), false, true);
tool("art_job_complete_urls", "Send the entire expected ordered image set using real publicly reachable HTTPS image URLs. ChatGPT attachment links and sandbox paths are not public image URLs. Reuse identical URLs/order on retry.",
  { ...lease, image_urls: z.array(z.string().url().startsWith("https://")).min(1).max(10) },
  ({ job_id, lease_token, image_urls }) => client.call(job_id, "complete", { lease_token, images: image_urls.map((url) => ({ url })) }), false, true);
tool("art_job_fail", "Report failure for your lease. retryable=true releases for another claim, up to three total attempts. Repeat with the same token is safe.",
  { ...lease, error: z.string().min(1).max(2000), retryable: z.boolean() },
  ({ job_id, ...body }) => client.call(job_id, "fail", body));
await server.connect(new StdioServerTransport());
