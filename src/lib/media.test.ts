import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CAROUSEL_IMAGES,
  MAX_IMAGE_BYTES,
  MEDIA_SOURCES,
  POST_MEDIA_BUCKET,
  inspectImageFile,
  mediaObjectPath,
  slotsForFormat,
} from "./media.ts";

const agencyId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const postId = "33333333-3333-4333-8333-333333333333";
const mediaId = "44444444-4444-4444-8444-444444444444";

test("only manual upload is a media source", () => {
  assert.deepEqual(MEDIA_SOURCES, ["upload"]);
  assert.equal(POST_MEDIA_BUCKET, "post-media");
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
  assert.equal(MAX_CAROUSEL_IMAGES, 10);
});

test("inspectImageFile accepts png, jpeg, and webp", () => {
  assert.deepEqual(inspectImageFile({ type: "image/png", size: 12 }), {
    ok: true,
    mime: "image/png",
    extension: "png",
  });
  assert.deepEqual(inspectImageFile({ type: "image/jpeg", size: 12 }), {
    ok: true,
    mime: "image/jpeg",
    extension: "jpg",
  });
  assert.deepEqual(inspectImageFile({ type: "image/webp", size: MAX_IMAGE_BYTES }), {
    ok: true,
    mime: "image/webp",
    extension: "webp",
  });
});

test("inspectImageFile rejects video, other types, empty files, and files over 10MB", () => {
  const video = inspectImageFile({ type: "video/mp4", size: 12 });
  assert.equal(video.ok, false);
  if (video.ok) return;
  assert.match(video.error, /Video/);

  const gif = inspectImageFile({ type: "image/gif", size: 12 });
  assert.equal(gif.ok, false);
  if (gif.ok) return;
  assert.match(gif.error, /PNG, JPEG, or WebP/);

  const empty = inspectImageFile({ type: "image/png", size: 0 });
  assert.equal(empty.ok, false);
  if (empty.ok) return;
  assert.match(empty.error, /empty/);

  const huge = inspectImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 });
  assert.equal(huge.ok, false);
  if (huge.ok) return;
  assert.match(huge.error, /10MB/);
});

test("mediaObjectPath stays under agency, client, and post", () => {
  assert.equal(
    mediaObjectPath({
      agencyId,
      clientId,
      postId,
      mediaId,
      extension: "jpg",
    }),
    `${agencyId}/${clientId}/${postId}/${mediaId}.jpg`,
  );
  assert.throws(() =>
    mediaObjectPath({
      agencyId: "not-an-id",
      clientId,
      postId,
      mediaId,
      extension: "jpg",
    }),
  );
});

test("slots follow the post type", () => {
  assert.deepEqual(slotsForFormat("Carousel"), { images: "carousel", cover: true });
  assert.deepEqual(slotsForFormat("Post"), { images: "static", cover: true });
  assert.deepEqual(slotsForFormat("Story"), { images: "static", cover: true });
  assert.deepEqual(slotsForFormat("Reel"), { images: null, cover: true });
});
