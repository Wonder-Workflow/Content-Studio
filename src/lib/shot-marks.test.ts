import assert from "node:assert/strict";
import test from "node:test";
import { clearShotMarks, parseShotMarks, toggleShotMark } from "./shot-marks.ts";

test("marks ignore junk and toggle one id", () => {
  assert.deepEqual(parseShotMarks(""), []);
  assert.deepEqual(parseShotMarks("not-json"), []);
  assert.deepEqual(parseShotMarks('{"id":"x"}'), []);
  assert.deepEqual(parseShotMarks('["keep", "", 4, "keep", "other"]'), ["keep", "other"]);

  const on = toggleShotMark("[]", "post-a");
  assert.deepEqual(parseShotMarks(on), ["post-a"]);
  const both = toggleShotMark(on, "post-b");
  assert.deepEqual(parseShotMarks(both), ["post-a", "post-b"]);
  assert.deepEqual(parseShotMarks(toggleShotMark(both, "post-a")), ["post-b"]);
});

test("clearing filmed marks only drops the ids on this sheet", () => {
  const raw = toggleShotMark(toggleShotMark("[]", "post-a"), "post-b");
  assert.deepEqual(parseShotMarks(clearShotMarks(raw, ["post-a"])), ["post-b"]);
  assert.deepEqual(parseShotMarks(clearShotMarks(raw, [])), ["post-a", "post-b"]);
});
