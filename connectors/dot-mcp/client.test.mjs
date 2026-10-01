import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createDotClient } from "./client.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
test("file completion reads real bytes, retains order, retries identically, and cannot read outside its folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "dot-mcp-test-"));
  try {
    const folder = join(root, "images");
    const { mkdir } = await import("node:fs/promises"); await mkdir(folder);
    const first = join(folder, "one.png"), second = join(folder, "two.png"), outside = join(root, "outside.png");
    await writeFile(first, png); await writeFile(second, png); await writeFile(outside, png);
    const requests = [];
    const client = createDotClient({ origin: "http://127.0.0.1:12345", secret: "test-placeholder", imageRoot: folder,
      fetchImpl: async (url, options) => { requests.push({ url: url.toString(), ...options }); return Response.json({ ok: true }); } });
    const id = randomUUID(), token = randomUUID();
    await client.completeFiles(id, token, [first, second]);
    await client.completeFiles(id, token, [first, second]);
    assert.equal(requests[0].body, requests[1].body);
    const body = JSON.parse(requests[0].body);
    assert.deepEqual(Buffer.from(body.images[0].base64, "base64"), png);
    assert.equal(body.lease_token, token);
    assert.equal(requests[0].redirect, "error");
    await assert.rejects(client.completeFiles(id, token, [outside]), /outside/);
    await assert.rejects(client.completeFiles(id, token, [join(folder, "invented.png")]), /ENOENT/);
    await writeFile(first, "not an image");
    await assert.rejects(client.completeFiles(id, token, [first]), /actual PNG/);
    assert.equal(requests.length, 2);
  } finally { assert.equal(dirname(root), tmpdir()); await rm(root, { recursive: true, force: true }); }
});

test("total encoded carousel limit is checked before HTTP; status never POSTs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dot-mcp-test-"));
  try {
    const paths = [];
    for (let n = 0; n < 2; n++) {
      const path = join(root, `${n}.png`); const bytes = Buffer.alloc(1_600_000); png.copy(bytes);
      await writeFile(path, bytes); paths.push(path);
    }
    const calls = [];
    const client = createDotClient({ origin: "http://localhost:12345", secret: "test-placeholder", imageRoot: root,
      fetchImpl: async (_url, options) => { calls.push(options); return Response.json({ status: "queued" }); } });
    const id = randomUUID();
    await assert.rejects(client.completeFiles(id, randomUUID(), paths), /4 MB/);
    assert.equal(calls.length, 0);
    await client.call(id);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].body, undefined);
  } finally { assert.equal(dirname(root), tmpdir()); await rm(root, { recursive: true, force: true }); }
});

test("connector rejects credential-bearing, non-origin and non-HTTPS destinations", () => {
  for (const origin of ["https://user:pass@example.test", "https://example.test/path", "https://example.test?token=x", "http://example.test"]) {
    assert.throws(() => createDotClient({ origin, secret: "test-placeholder" }));
  }
});
