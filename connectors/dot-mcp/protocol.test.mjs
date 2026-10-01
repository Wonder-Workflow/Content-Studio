import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

test("official SDK initializes stdio, lists operations, and calls read-only status against loopback only", async () => {
  const calls = [];
  const http = createServer((req, res) => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ job: { status: "queued" } }));
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "local-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [fileURLToPath(new URL("server.mjs", import.meta.url))],
    env: { DOT_STUDIO_ORIGIN: `http://127.0.0.1:${http.address().port}`, DOT_ART_CALLBACK_SECRET: "test-placeholder" },
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["art_job_status", "art_job_claim", "art_job_renew", "art_job_complete_files", "art_job_complete_urls", "art_job_fail"].sort());
    assert.equal(tools.find((t) => t.name === "art_job_status").annotations.readOnlyHint, true);
    const id = randomUUID();
    const result = await client.callTool({ name: "art_job_status", arguments: { job_id: id } });
    assert.equal(JSON.parse(result.content[0].text).job.status, "queued");
    assert.deepEqual(calls, [{ method: "GET", url: `/api/dot/art-jobs/${id}`, auth: "Bearer test-placeholder" }]);
  } finally {
    await client.close(); await transport.close();
    await new Promise((resolve) => http.close(resolve));
  }
});
