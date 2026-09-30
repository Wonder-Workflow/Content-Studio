import assert from "node:assert/strict";
import test from "node:test";
import {
  GHL_ADVANCE_HEADERS,
  GHL_FACEBOOK_TYPE_INDEX,
  GHL_INSTAGRAM_TYPE_INDEX,
  GHL_SCHEDULE_TIME,
  buildGhlCsv,
  ghlRowCells,
} from "./ghl-csv.ts";

const slide = (position: number, url: string) => ({
  kind: "carousel" as const,
  position,
  url,
});

test("Advance headers match the GHL sample field names and add thumbnailUrl", () => {
  assert.equal(GHL_ADVANCE_HEADERS[0], "postAtSpecificTime (YYYY-MM-DD HH:mm:ss)");
  assert.equal(GHL_ADVANCE_HEADERS[1], "content");
  assert.equal(GHL_ADVANCE_HEADERS[3], "imageUrls (comma-separated)");
  assert.equal(GHL_ADVANCE_HEADERS[5], "videoUrls (comma-separated)");
  assert.equal(GHL_ADVANCE_HEADERS[6], "thumbnailUrl");
  assert.equal(GHL_ADVANCE_HEADERS[7], "mediaOptimization (true/false)");
  assert.equal(GHL_ADVANCE_HEADERS[GHL_FACEBOOK_TYPE_INDEX], "type (post/story/reel)");
  assert.equal(GHL_ADVANCE_HEADERS[GHL_INSTAGRAM_TYPE_INDEX], "type (post/story/reel)");
  assert.ok(GHL_FACEBOOK_TYPE_INDEX < GHL_INSTAGRAM_TYPE_INDEX);
  assert.equal(GHL_SCHEDULE_TIME, "09:00:00");
});

test("carousel images stay in order, cover is the thumbnail, and video stays empty", () => {
  const cells = ghlRowCells({
    startsOn: "2026-09-30",
    caption: 'Say "hello", then book',
    format: "Carousel",
    platform: "Instagram",
    media: [
      slide(1, "https://cdn.example/b.jpg"),
      { kind: "cover", position: 0, url: "https://cdn.example/cover.jpg" },
      slide(0, "https://cdn.example/a.jpg"),
      { kind: "static", position: 0, url: "https://cdn.example/static.jpg" },
    ],
  });

  assert.equal(cells.length, GHL_ADVANCE_HEADERS.length);
  assert.equal(cells[0], "2026-09-30 09:00:00");
  assert.equal(cells[1], 'Say "hello", then book');
  assert.equal(cells[3], "https://cdn.example/a.jpg, https://cdn.example/b.jpg");
  assert.equal(cells[5], "");
  assert.equal(cells[6], "https://cdn.example/cover.jpg");
  assert.equal(cells[7], "");
  assert.equal(cells[GHL_FACEBOOK_TYPE_INDEX], "");
  assert.equal(cells[GHL_INSTAGRAM_TYPE_INDEX], "post");
});

test("a reel keeps the manual cover on thumbnailUrl and does not invent other platforms", () => {
  const cells = ghlRowCells({
    startsOn: "2026-10-02",
    caption: "Watch this",
    format: "Reel",
    platform: "TikTok",
    media: [{ kind: "cover", position: 0, url: "https://cdn.example/reel-cover.jpg" }],
  });

  assert.equal(cells[3], "");
  assert.equal(cells[5], "");
  assert.equal(cells[6], "https://cdn.example/reel-cover.jpg");
  assert.equal(cells[GHL_FACEBOOK_TYPE_INDEX], "");
  assert.equal(cells[GHL_INSTAGRAM_TYPE_INDEX], "");
});

test("facebook stories and static posts fill only the matching type column", () => {
  const story = ghlRowCells({
    startsOn: "2026-10-03",
    caption: "",
    format: "Story",
    platform: "Facebook",
    media: [{ kind: "static", position: 0, url: "https://cdn.example/story.jpg" }],
  });
  assert.equal(story[3], "https://cdn.example/story.jpg");
  assert.equal(story[GHL_FACEBOOK_TYPE_INDEX], "story");
  assert.equal(story[GHL_INSTAGRAM_TYPE_INDEX], "");

  const reel = ghlRowCells({
    startsOn: "2026-10-04",
    caption: "Cover only",
    format: "Reel",
    platform: " instagram ",
    media: [],
  });
  assert.equal(reel[GHL_INSTAGRAM_TYPE_INDEX], "reel");
  assert.equal(reel[GHL_FACEBOOK_TYPE_INDEX], "");
});

test("buildGhlCsv quotes captions and keeps one header row", () => {
  const csv = buildGhlCsv([
    {
      startsOn: "2026-09-30",
      caption: "Line one\nLine two, with a comma",
      format: "Post",
      platform: "",
      media: [],
    },
  ]);
  assert.equal(csv.split("\n")[0], GHL_ADVANCE_HEADERS.join(","));
  assert.match(csv, /"Line one\nLine two, with a comma"/);
  assert.equal(csv.endsWith("\n"), true);
});
