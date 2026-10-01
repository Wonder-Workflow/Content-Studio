import assert from "node:assert/strict";
import test from "node:test";
import { ART_CALLBACK_MAX_BODY_BYTES, artCompletionHash, readArtCallbackBody, readLeaseToken } from "./art-lease.ts";

test("lease requires a valid token; ordered descriptors give a stable replay hash", () => {
  assert.equal(readLeaseToken({ lease_token: "33333333-3333-4333-8333-333333333333" }), "33333333-3333-4333-8333-333333333333");
  assert.equal(readLeaseToken({ lease_token: "invented" }), null);
  const images = [{ kind: "url", url: "https://example.test/one.png" }, { kind: "url", url: "https://example.test/two.png" }];
  assert.equal(artCompletionHash(images), artCompletionHash(structuredClone(images)));
  assert.notEqual(artCompletionHash(images), artCompletionHash(images.toReversed()));
});

test("callback enforces total request bytes even without content-length", async () => {
  assert.deepEqual(await readArtCallbackBody(new Request("http://localhost", { method: "POST", body: '{"images":[]}' })), { images: [] });
  await assert.rejects(() => readArtCallbackBody(new Request("http://localhost", { method: "POST", body: "x", headers: { "content-length": String(ART_CALLBACK_MAX_BODY_BYTES + 1) } })), /too large/);
  await assert.rejects(() => readArtCallbackBody(new Request("http://localhost", { method: "POST", body: "x".repeat(ART_CALLBACK_MAX_BODY_BYTES + 1) })), /too large/);
});
