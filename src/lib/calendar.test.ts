import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  buildMonthGrid,
  coversDay,
  diffDays,
  monthBounds,
  normalizeRange,
  parseMonthKey,
  rangePosition,
  shiftMonth,
} from "./calendar.ts";

test("September 2026 starts on Tuesday and has 30 days", () => {
  const cells = buildMonthGrid(2026, 8);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.filter((cell) => cell.iso === null).length, 2 + 3);
  assert.equal(cells[2]?.iso, "2026-09-01");
  assert.equal(cells.findLast((cell) => cell.iso)?.iso, "2026-09-30");
  const bounds = monthBounds(2026, 8);
  assert.deepEqual(bounds, { start: "2026-09-01", end: "2026-09-30" });
});

test("a range covers every day from start through end", () => {
  assert.equal(coversDay("2026-09-03", "2026-09-05", "2026-09-03"), true);
  assert.equal(coversDay("2026-09-03", "2026-09-05", "2026-09-04"), true);
  assert.equal(coversDay("2026-09-03", "2026-09-05", "2026-09-05"), true);
  assert.equal(coversDay("2026-09-03", "2026-09-05", "2026-09-06"), false);
  assert.equal(coversDay("2026-09-03", null, "2026-09-03"), true);
  assert.equal(coversDay("2026-09-03", null, "2026-09-04"), false);
  assert.deepEqual(rangePosition("2026-09-03", "2026-09-05", "2026-09-04"), {
    day: 2,
    total: 3,
  });
});

test("moving a range keeps its length across a month boundary", () => {
  const delta = diffDays("2026-09-30", "2026-10-02");
  assert.equal(delta, 2);
  assert.equal(addDays("2026-09-28", delta ?? 0), "2026-09-30");
  assert.equal(addDays("2026-09-30", delta ?? 0), "2026-10-02");
});

test("normalizeRange rejects an end before the start and a span past 62 days", () => {
  assert.deepEqual(normalizeRange("2026-09-03", ""), {
    ok: true,
    startsOn: "2026-09-03",
    endsOn: null,
  });
  assert.deepEqual(normalizeRange("2026-09-03", "2026-09-03"), {
    ok: true,
    startsOn: "2026-09-03",
    endsOn: null,
  });
  const backwards = normalizeRange("2026-09-10", "2026-09-02");
  assert.equal(backwards.ok, false);
  const tooLong = normalizeRange("2026-09-01", "2026-11-15");
  assert.equal(tooLong.ok, false);
  assert.equal(normalizeRange("2026-02-31", null).ok, false);
});

test("month keys shift across years and ignore junk", () => {
  assert.equal(shiftMonth(2026, 0, -1), "2025-12");
  assert.equal(shiftMonth(2026, 11, 1), "2027-01");
  const fallback = new Date(2026, 8, 14);
  assert.equal(parseMonthKey("nope", fallback).key, "2026-09");
  assert.equal(parseMonthKey("2026-13", fallback).key, "2026-09");
  assert.equal(parseMonthKey("2026-04", fallback).key, "2026-04");
});
