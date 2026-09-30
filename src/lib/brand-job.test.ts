import assert from "node:assert/strict";
import test from "node:test";
import {
  brandBotAuthorization,
  postBrandBotWebhook,
  readBrandBotEnv,
} from "./brand-bot.ts";
import {
  BRAND_PULL_ALREADY_DONE,
  BRAND_PULL_NOT_CONFIGURED,
  brandBotPayload,
  brandJobFromRow,
  decideBrandPull,
  normalizePublicUrl,
  readBrandPullFields,
} from "./brand-job.ts";

test("decideBrandPull keeps one open job and one completed pull", () => {
  assert.deepEqual(
    decideBrandPull({ regenerate: false, hasCompleted: false, openJobId: null }),
    { type: "insert" },
  );
  assert.deepEqual(
    decideBrandPull({ regenerate: false, hasCompleted: false, openJobId: "job-1" }),
    { type: "return_open", jobId: "job-1" },
  );
  assert.deepEqual(
    decideBrandPull({ regenerate: false, hasCompleted: true, openJobId: "job-1" }),
    { type: "return_open", jobId: "job-1" },
  );
  assert.equal(
    decideBrandPull({ regenerate: false, hasCompleted: true, openJobId: null }).type,
    "reject_completed",
  );
  assert.deepEqual(
    decideBrandPull({ regenerate: true, hasCompleted: true, openJobId: null }),
    { type: "insert" },
  );
  assert.deepEqual(
    decideBrandPull({ regenerate: true, hasCompleted: true, openJobId: "job-1" }),
    { type: "replace_open", jobId: "job-1" },
  );
});

test("readBrandPullFields normalizes the website and social lines", () => {
  const form = new FormData();
  form.set("websiteUrl", " harbor.example/about ");
  form.set("socialUrls", "https://instagram.com/harbor\n\nharbor.example/about\njavascript:alert(1)");
  form.set("notes", "  Keep the ridge line.  ");
  form.set("intent", "pull");

  const bad = readBrandPullFields(form);
  assert.equal(bad.ok, false);

  form.set("socialUrls", "https://instagram.com/harbor\n\nhttps://www.instagram.com/harbor/\n tiktok.com/@harbor ");
  const result = readBrandPullFields(form);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fields.websiteUrl, "https://harbor.example/about");
  assert.deepEqual(result.fields.socialUrls, [
    "https://instagram.com/harbor",
    "https://www.instagram.com/harbor/",
    "https://tiktok.com/@harbor",
  ]);
  assert.equal(result.fields.notes, "Keep the ridge line.");
  assert.equal(result.fields.regenerate, false);

  form.set("intent", "regenerate");
  const again = readBrandPullFields(form);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.fields.regenerate, true);
});

test("normalizePublicUrl rejects non-http links", () => {
  assert.equal(normalizePublicUrl("javascript:alert(1)"), null);
  assert.equal(normalizePublicUrl("not a url"), null);
  assert.equal(normalizePublicUrl(""), null);
  assert.equal(normalizePublicUrl("https://user:pass@harbor.example"), null);
});

test("brandBotPayload omits empty notes", () => {
  assert.deepEqual(
    brandBotPayload({
      jobId: "job-1",
      clientId: "client-1",
      websiteUrl: "https://harbor.example/",
      socialUrls: [],
      regenerate: false,
      notes: null,
    }),
    {
      job_id: "job-1",
      client_id: "client-1",
      website_url: "https://harbor.example/",
      social_urls: [],
      regenerate: false,
    },
  );
  assert.equal("notes" in brandBotPayload({
    jobId: "job-1",
    clientId: "client-1",
    websiteUrl: "https://harbor.example/",
    socialUrls: ["https://instagram.com/harbor"],
    regenerate: true,
    notes: "Keep the ridge.",
  }), true);
});

test("brandJobFromRow reads a queue row", () => {
  assert.equal(brandJobFromRow(null), null);
  assert.deepEqual(
    brandJobFromRow({
      id: "job-1",
      client_id: "client-1",
      status: "queued",
      error: null,
      website_url: "https://harbor.example/",
      social_urls: ["https://instagram.com/harbor"],
      notes: null,
      regenerate: false,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
      completed_at: null,
    })?.status,
    "queued",
  );
});

test("readBrandBotEnv asks for both webhook settings", () => {
  assert.deepEqual(readBrandBotEnv({}), { ok: false, error: BRAND_PULL_NOT_CONFIGURED });
  assert.equal(
    readBrandBotEnv({
      BRAND_BOT_WEBHOOK_URL: "https://api2.cursor.sh/automations/webhook/example",
      BRAND_BOT_WEBHOOK_SECRET: "crsr_test",
    }).ok,
    true,
  );
});

test("postBrandBotWebhook sends Authorization Bearer and does not wait past the accept", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("ok", { status: 200 });
  };
  const payload = brandBotPayload({
    jobId: "job-1",
    clientId: "client-1",
    websiteUrl: "https://harbor.example/",
    socialUrls: ["https://instagram.com/harbor"],
    regenerate: false,
    notes: null,
  });
  const result = await postBrandBotWebhook(
    payload,
    { url: "https://bot.example/hook", secret: "Bearer crsr_test" },
    fetchImpl,
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://bot.example/hook");
  assert.equal(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("authorization"), "Bearer crsr_test");
  assert.equal(brandBotAuthorization("crsr_test"), "Bearer crsr_test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), payload);

  const rejected = await postBrandBotWebhook(payload, { url: "https://bot.example/hook", secret: "crsr_test" }, async () => new Response("no", { status: 401 }));
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.match(rejected.error, /401/);
});

test("completed pull message names Regenerate", () => {
  assert.match(BRAND_PULL_ALREADY_DONE, /Regenerate/);
});
