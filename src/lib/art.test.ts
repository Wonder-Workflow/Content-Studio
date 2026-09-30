import assert from "node:assert/strict";
import test from "node:test";
import { artCallbackAuthorized } from "./art-auth.ts";
import { postDotSlackBrief, readDotSlackEnv } from "./art-bot.ts";
import {
  DOT_SLACK_PRODUCTION_CHANNEL_ID,
  DOT_SLACK_PRODUCTION_CHANNEL_NAME,
  DOT_SLACK_WORKSPACE_HOST,
} from "./art-channel.ts";
import {
  collectArtFiles,
  decodeBase64Image,
  downloadArtImage,
  isBlockedAddress,
  parseCompleteImages,
  parsePublicImageUrl,
  sniffImage,
} from "./art-image.ts";
import { emptyBrand } from "./brand.ts";
import { emptyPack } from "./pack.ts";
import {
  ART_QUEUED_PLUGIN,
  ART_QUEUED_SLACK,
  buildArtBrief,
  describeArtSlots,
  dotSlackText,
  packPath,
  parseFailReason,
  planArtWrites,
  queuedArtMessage,
  readArtRequest,
  slotsAreFull,
} from "./art-job.ts";

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

test("production Slack channel is #content", () => {
  assert.equal(DOT_SLACK_PRODUCTION_CHANNEL_ID, "C0C5S889VTL");
  assert.equal(DOT_SLACK_PRODUCTION_CHANNEL_NAME, "#content");
  assert.equal(DOT_SLACK_WORKSPACE_HOST, "agents-wby7363.slack.com");
});

test("readDotSlackEnv defaults a blank channel to production", () => {
  assert.deepEqual(readDotSlackEnv({}), { ok: false, reason: "missing_token" });
  const ready = readDotSlackEnv({
    DOT_SLACK_BOT_TOKEN: "Bearer xoxb-test",
    DOT_SLACK_CHANNEL_ID: "  ",
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.env.token, "xoxb-test");
  assert.equal(ready.env.channelId, "C0C5S889VTL");

  const custom = readDotSlackEnv({
    DOT_SLACK_BOT_TOKEN: "xoxb-test",
    DOT_SLACK_CHANNEL_ID: "C0123456789",
  });
  assert.equal(custom.ok, true);
  if (!custom.ok) return;
  assert.equal(custom.env.channelId, "C0123456789");
  assert.equal(readDotSlackEnv({ DOT_SLACK_BOT_TOKEN: "xoxb", DOT_SLACK_CHANNEL_ID: "general" }).ok, false);
});

test("Slack text labels DOT and includes the pack path", () => {
  const text = dotSlackText({
    jobId: "job-1",
    postId: "post-1",
    clientSlug: "harbor",
    format: "Carousel",
    brief: "Draw the ridge.",
  });
  assert.match(text, /^DOT, pick up this art job\./);
  assert.match(text, /Job id: job-1/);
  assert.match(text, /Post id: post-1/);
  assert.match(text, /Client: harbor/);
  assert.match(text, /Pack: \/clients\/harbor\/packs\/post-1/);
  assert.match(text, /Format: Carousel/);
  assert.match(text, /Brief:\nDraw the ridge\./);
  assert.equal(packPath("harbor", "post-1"), "/clients/harbor/packs/post-1");

  const long = dotSlackText({
    jobId: "job-1",
    postId: "post-1",
    clientSlug: "harbor",
    format: "Post",
    brief: "a".repeat(2600),
  });
  assert.match(long, /Brief summary:/);
  assert.ok(long.length < 2600 + 400);
});

test("postDotSlackBrief sends the channel and token", async () => {
  let seen: { url: string; authorization: string; body: { channel?: string; text?: string } } | null =
    null;
  const result = await postDotSlackBrief(
    { token: "xoxb-test", channelId: "C0C5S889VTL", text: "DOT, pick up this art job." },
    async (url, init) => {
      seen = {
        url: String(url),
        authorization: String(new Headers(init?.headers).get("authorization")),
        body: JSON.parse(String(init?.body)) as { channel?: string; text?: string },
      };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  );
  assert.equal(result.ok, true);
  assert.equal(seen?.url, "https://slack.com/api/chat.postMessage");
  assert.equal(seen?.authorization, "Bearer xoxb-test");
  assert.equal(seen?.body.channel, "C0C5S889VTL");
  assert.match(seen?.body.text ?? "", /DOT, pick up/);
});

test("brief uses brand and pack text and skips blank fields", () => {
  const brand = emptyBrand();
  brand.identity.name = "Harbor";
  brand.visual_notes = "Blue hour.";
  brand.colors = { primary: "#112233" };
  const slots = describeArtSlots({ format: "Carousel", positions: [0, 1], replace: false });
  const brief = buildArtBrief({
    clientName: "Harbor Co",
    clientSlug: "harbor",
    postId: "post-1",
    brand,
    post: {
      title: "Ridge walk",
      hook: "Come up the ridge.",
      format: "Carousel",
      platform: "Instagram",
      pack: { ...emptyPack(), caption: "See you at dawn." },
    },
    notes: "Keep the ridge line.",
    slots,
  });
  assert.match(brief, /Brand name: Harbor/);
  assert.match(brief, /Visual notes: Blue hour\./);
  assert.match(brief, /Colors: primary #112233/);
  assert.match(brief, /Post title: Ridge walk/);
  assert.match(brief, /Hook: Come up the ridge\./);
  assert.match(brief, /Caption: See you at dawn\./);
  assert.match(brief, /Notes: Keep the ridge line\./);
  assert.match(brief, /Pack: \/clients\/harbor\/packs\/post-1/);
  assert.doesNotMatch(brief, /Audience:/);
  assert.match(brief, /8 carousel slides/);
  assert.equal(slots.emptyPositions.join(","), "2,3,4,5,6,7,8,9");
  assert.equal(slotsAreFull([0, 1], 10), false);
  assert.equal(slotsAreFull([0], 1), true);
});

test("replace plans wipe the kind and fill plans use empty positions only", () => {
  const fill = planArtWrites({ occupied: [0, 2], incomingCount: 5, replace: false, max: 10 });
  assert.equal(fill.ok, true);
  if (!fill.ok) return;
  assert.equal(fill.plan.deleteExisting, false);
  assert.deepEqual(
    fill.plan.inserts.map((row) => row.position),
    [1, 3, 4, 5, 6],
  );

  const replace = planArtWrites({ occupied: [0, 1, 2], incomingCount: 2, replace: true, max: 10 });
  assert.equal(replace.ok, true);
  if (!replace.ok) return;
  assert.equal(replace.plan.deleteExisting, true);
  assert.deepEqual(
    replace.plan.inserts.map((row) => row.position),
    [0, 1],
  );

  const blocked = planArtWrites({ occupied: [0], incomingCount: 1, replace: false, max: 1 });
  assert.equal(blocked.ok, false);
});

test("readArtRequest keeps notes and the replace intent", () => {
  const form = new FormData();
  form.set("notes", "  Keep it quiet.  ");
  form.set("intent", "generate");
  const generate = readArtRequest(form);
  assert.equal(generate.ok, true);
  if (!generate.ok) return;
  assert.equal(generate.notes, "Keep it quiet.");
  assert.equal(generate.replace, false);

  form.set("intent", "replace");
  const replace = readArtRequest(form);
  assert.equal(replace.ok, true);
  if (!replace.ok) return;
  assert.equal(replace.replace, true);
  assert.equal(queuedArtMessage({ slack: "content" }), ART_QUEUED_SLACK);
  assert.match(queuedArtMessage({ slack: "skipped" }), /plugin/);
  assert.equal(ART_QUEUED_PLUGIN.includes("Slack is not connected"), true);
});

test("callback bearer must match the secret", () => {
  assert.equal(artCallbackAuthorized("Bearer secret-value", "secret-value"), true);
  assert.equal(artCallbackAuthorized("bearer secret-value", "secret-value"), true);
  assert.equal(artCallbackAuthorized("Bearer other-value", "secret-value"), false);
  assert.equal(artCallbackAuthorized("Bearer secret-value-x", "secret-value"), false);
  assert.equal(artCallbackAuthorized(null, "secret-value"), false);
});

test("complete body prefers a url and fail text is clipped", () => {
  const parsed = parseCompleteImages({
    images: [{ url: " https://cdn.example/a.png ", base64: "aaaa" }, { base64: "bbbb" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.images[0], { kind: "url", url: "https://cdn.example/a.png" });
  assert.equal(parsed.images[1]?.kind, "base64");

  const tooMany = parseCompleteImages({ images: Array.from({ length: 11 }, () => ({ url: "https://a.example/a.png" })) });
  assert.equal(tooMany.ok, false);

  const reason = parseFailReason({ error: `  ${"x".repeat(2100)}  ` });
  assert.equal(reason.ok, true);
  if (!reason.ok) return;
  assert.equal(reason.error.length, 2000);
});

test("image bytes are sniffed and private hosts are refused", async () => {
  assert.equal(sniffImage(png)?.mime, "image/png");
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.extension, "jpg");
  assert.equal(sniffImage(Uint8Array.from([0x47, 0x49, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("10.0.0.8"), true);
  assert.equal(isBlockedAddress("192.168.0.2"), true);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
  assert.equal(parsePublicImageUrl("http://cdn.example/a.png"), null);
  assert.equal(parsePublicImageUrl("https://127.0.0.1/a.png"), null);
  assert.ok(parsePublicImageUrl("https://cdn.example/a.png"));

  const encoded = Buffer.from(png).toString("base64");
  const decoded = decodeBase64Image(`data:image/png;base64,${encoded}`);
  assert.equal(decoded?.length, png.length);

  let fetches = 0;
  const blocked = await downloadArtImage("https://cdn.example/a.png", {
    lookup: async () => ["127.0.0.1"],
    fetch: async () => {
      fetches += 1;
      return new Response(png);
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(fetches, 0);

  const saved = await collectArtFiles([{ kind: "base64", base64: encoded }]);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.files[0]?.mime, "image/png");
});
