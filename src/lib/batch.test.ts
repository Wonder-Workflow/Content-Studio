import assert from "node:assert/strict";
import test from "node:test";
import { emptyBrand, type BrandProfile } from "./brand.ts";
import { emptyPack } from "./pack.ts";
import { CAPTION_MAX, CTA_MAX, SHOT_LIST_MAX } from "./pack.ts";
import { HOOK_MAX, TITLE_MAX } from "./posts.ts";
import {
  applyRevision,
  batchBriefNotes,
  draftPackCopy,
  planBatch,
  readMix,
  readReferenceUrls,
  readRevisionNote,
  revisionQueuesArt,
  windowForPreset,
} from "./batch.ts";

function brand(): BrandProfile {
  const profile = emptyBrand();
  profile.identity.name = "Desert Bloom";
  profile.identity.tagline = "Slow mornings, warm stone.";
  profile.identity.positioning = "A small inn for people who want quiet.";
  profile.audience = "Couples planning a long weekend.";
  profile.offers = "Garden suite\nPool day\nDesert breakfast";
  profile.voice.tone = "Warm, unhurried";
  profile.voice.caption_pattern = "Start with the feeling, then the offer, then a soft invite.";
  profile.visual_notes = "Late light, sand tones, no hard flash.";
  profile.phrases = "Come stay\nSave this for the weekend";
  profile.do = "Show the room before the logo.";
  return profile;
}

test("presets are inclusive ranges from today", () => {
  assert.deepEqual(windowForPreset("1-week", "2026-09-30"), {
    start: "2026-09-30",
    end: "2026-10-06",
  });
  assert.deepEqual(windowForPreset("2-weeks", "2026-09-30"), {
    start: "2026-09-30",
    end: "2026-10-13",
  });
  assert.deepEqual(windowForPreset("1-month", "2026-09-30"), {
    start: "2026-09-30",
    end: "2026-10-29",
  });
  assert.deepEqual(windowForPreset("1-month", "2026-01-31"), {
    start: "2026-01-31",
    end: "2026-02-27",
  });
  assert.equal(windowForPreset("1-week", "nope"), null);
});

test("a week spreads the default mix across the days", () => {
  const mix = readMix({ carousel: "1", staticCount: "3", reel: "0" });
  assert.equal(mix.ok, true);
  if (!mix.ok) return;
  const plan = planBatch("2026-09-30", "2026-10-06", mix.mix);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.slots.length, 4);
  assert.deepEqual(
    plan.slots.map((slot) => slot.format),
    ["Post", "Carousel", "Post", "Post"],
  );
  assert.deepEqual(
    plan.slots.map((slot) => slot.startsOn),
    ["2026-09-30", "2026-10-02", "2026-10-04", "2026-10-06"],
  );
  assert.deepEqual(
    plan.slots.map((slot) => slot.sequence),
    [1, 1, 2, 3],
  );
});

test("two weeks repeat the mix and a short tail is scaled", () => {
  const mix = readMix({ carousel: "1", staticCount: "3", reel: "1" });
  assert.equal(mix.ok, true);
  if (!mix.ok) return;
  const two = planBatch("2026-09-30", "2026-10-13", mix.mix);
  assert.equal(two.ok, true);
  if (!two.ok) return;
  assert.equal(two.slots.length, 10);

  const month = planBatch("2026-09-30", "2026-10-29", mix.mix);
  assert.equal(month.ok, true);
  if (!month.ok) return;
  const tail = month.slots.filter((slot) => slot.startsOn >= "2026-10-28");
  assert.equal(tail.length, 1);
  assert.equal(tail[0]?.format, "Post");
});

test("mix and links are rejected when they do not fit", () => {
  assert.equal(readMix({ carousel: "0", staticCount: "0", reel: "0" }).ok, false);
  assert.equal(readMix({ carousel: "8", staticCount: "0", reel: "0" }).ok, false);
  assert.equal(readMix({ carousel: "1.5", staticCount: "1", reel: "0" }).ok, false);
  const urls = readReferenceUrls("https://www.instagram.com/p/abc/\nhttp://example.com/a");
  assert.equal(urls.ok, false);
  const ok = readReferenceUrls("https://www.instagram.com/p/abc/\nhttps://example.com/look");
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.urls.length, 2);
  assert.equal(readRevisionNote("  ").ok, false);
});

test("draft copy stays inside pack limits and uses the brand", () => {
  const draft = draftPackCopy({
    brand: brand(),
    format: "Carousel",
    startsOn: "2026-09-30",
    sequence: 1,
    styleNote: "Copy the airy carousel on their feed.",
    referenceUrls: ["https://www.instagram.com/p/abc/"],
  });
  assert.ok(draft.title.length <= TITLE_MAX);
  assert.match(draft.title, /Sep 30/);
  assert.match(draft.title, /Carousel 1/);
  assert.match(draft.title, /Garden suite/);
  assert.equal(draft.platform, "Instagram");
  assert.ok(draft.hook.length <= HOOK_MAX);
  assert.match(draft.hook, /quiet/);
  assert.match(draft.hook, /airy carousel/);
  assert.ok(draft.pack.caption.length <= CAPTION_MAX);
  assert.match(draft.pack.caption, /Start with the feeling/);
  assert.ok(draft.pack.cta.length <= CTA_MAX);
  assert.equal(draft.pack.cta, "Come stay");
  assert.ok(draft.pack.shot_list_and_angles.length <= SHOT_LIST_MAX);
  assert.match(draft.pack.shot_list_and_angles, /Slide 1/);
  assert.match(draft.pack.shot_list_and_angles, /Slide 2/);
  assert.match(draft.pack.shot_list_and_angles, /instagram.com/);
  assert.equal(draft.pack.shot_list_and_angles.includes("Notes"), false);

  const bare = draftPackCopy({
    brand: emptyBrand(),
    format: "Reel",
    startsOn: "2026-10-02",
    sequence: 2,
    styleNote: "",
    referenceUrls: [],
  });
  assert.match(bare.title, /Reel 2/);
  assert.match(bare.pack.shot_list_and_angles, /Cover frame/);
  assert.ok(bare.hook.length > 0);
});

test("a revision updates the fields it names and queues art only for a look change", () => {
  const current = {
    title: "Sep 30 · Post 1 · Garden suite",
    hook: "A small inn for people who want quiet.",
    pack: {
      ...emptyPack(),
      shot_list_and_angles: "Slide 1 — cover.\nSlide 2 — the offer.",
      caption: "Slow mornings.",
      cta: "Come stay",
    },
  };

  const hook = applyRevision(current, "change the hook to Come in from the heat");
  assert.equal(hook.queueArt, false);
  assert.equal(hook.hook, "Come in from the heat");
  assert.equal(hook.pack.caption, current.pack.caption);
  assert.equal(hook.title, current.title);

  const slide = applyRevision(current, "redo slide 2");
  assert.equal(slide.queueArt, true);
  assert.match(slide.pack.shot_list_and_angles, /Slide 2 — the offer\. — redo slide 2/);
  assert.equal(slide.hook, current.hook);
  assert.equal(slide.pack.caption, current.pack.caption);

  const warmer = applyRevision(current, "warmer tones");
  assert.equal(warmer.queueArt, true);
  assert.match(warmer.pack.shot_list_and_angles, /Revision: warmer tones/);
  assert.equal(warmer.hook, current.hook);

  const general = applyRevision(current, "make it shorter");
  assert.equal(general.queueArt, false);
  assert.match(general.hook, /Revision: make it shorter/);
  assert.match(general.pack.caption, /Revision: make it shorter/);
  assert.equal(revisionQueuesArt("change hook"), false);
});

test("a long revision stays inside the hook limit", () => {
  const current = {
    title: "Title",
    hook: "H".repeat(HOOK_MAX),
    pack: emptyPack(),
  };
  const revised = applyRevision(current, "change hook");
  assert.ok(revised.hook.length <= HOOK_MAX);
  assert.match(revised.hook, /Revision: change hook/);
});

test("brief notes list style, links, and the revision", () => {
  const notes = batchBriefNotes({
    styleNote: "Airy carousels.",
    referenceUrls: ["https://www.instagram.com/p/abc/"],
    referenceImageUrls: ["https://cdn.example/ref.png"],
    revisionNote: "warmer tones",
  });
  assert.match(notes, /Style direction: Airy carousels\./);
  assert.match(notes, /instagram.com/);
  assert.match(notes, /Reference images/);
  assert.match(notes, /Revision: warmer tones/);
});
