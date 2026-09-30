import assert from "node:assert/strict";
import test from "node:test";
import type { Post } from "./posts.ts";
import {
  MAX_SHOT_WINDOW_DAYS,
  SHOT_ROW_FIELDS,
  buildShotList,
  defaultShotWindow,
  firstQueryValue,
  formatShotSchedule,
  parseShotQuery,
  postOverlapsRange,
  shootStatuses,
} from "./shot-list.ts";

const windowQuery = {
  from: "2026-09-01",
  to: "2026-09-30",
  includeReady: false,
};

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Harbor open",
    hook: "The ridge before breakfast",
    status: "in-creation",
    format: "Reel",
    platform: "Instagram",
    starts_on: "2026-09-03",
    ends_on: null,
    pack: {
      shot_list_and_angles: "Wide of the dock\nClose on hands",
      caption: "Leave this off the sheet",
      cta: "Book a call",
    },
    batchId: null,
    ...overrides,
  };
}

test("an empty query uses the current month and leaves Ready off", () => {
  const result = parseShotQuery({}, new Date(2026, 8, 30));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.query, {
    from: "2026-09-01",
    to: "2026-09-30",
    includeReady: false,
  });
  assert.deepEqual(defaultShotWindow(new Date(2026, 11, 2)), {
    from: "2026-12-01",
    to: "2026-12-31",
  });
  assert.deepEqual(shootStatuses(false), ["in-creation"]);
  assert.deepEqual(shootStatuses(true), ["in-creation", "ready"]);
});

test("blank dates fall back to the month and a ready flag still applies", () => {
  const result = parseShotQuery(
    { from: "  ", to: "", ready: "1" },
    new Date(2026, 8, 14),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.query, {
    from: "2026-09-01",
    to: "2026-09-30",
    includeReady: true,
  });
});

test("a custom range is trimmed and Ready accepts the form values", () => {
  const result = parseShotQuery({
    from: " 2026-09-10 ",
    to: "2026-09-12",
    ready: "on",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.query.from, "2026-09-10");
  assert.equal(result.query.to, "2026-09-12");
  assert.equal(result.query.includeReady, true);
  assert.equal(parseShotQuery({ from: "2026-09-01", to: "2026-09-02", ready: "0" }).ok, true);
  const off = parseShotQuery({ from: "2026-09-01", to: "2026-09-02", ready: "yes" });
  assert.equal(off.ok, true);
  if (!off.ok) return;
  assert.equal(off.query.includeReady, false);
});

test("bad ranges explain the problem and do not throw", () => {
  const missing = parseShotQuery({ from: "2026-09-01", to: "" });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.error, "Choose a valid start and end date.");
  assert.equal(missing.from, "2026-09-01");
  assert.equal(missing.to, "");

  const garbage = parseShotQuery({ from: "nope", to: "2026-09-02" });
  assert.equal(garbage.ok, false);

  const backwards = parseShotQuery({ from: "2026-09-10", to: "2026-09-02" });
  assert.equal(backwards.ok, false);
  if (backwards.ok) return;
  assert.match(backwards.error, /end date/);
  assert.equal(backwards.from, "2026-09-10");
  assert.equal(backwards.to, "2026-09-02");

  const tooLong = parseShotQuery({ from: "2026-01-01", to: "2027-01-02" });
  assert.equal(tooLong.ok, false);
  if (tooLong.ok) return;
  assert.match(tooLong.error, new RegExp(String(MAX_SHOT_WINDOW_DAYS)));

  const year = parseShotQuery({ from: "2026-01-01", to: "2027-01-01" });
  assert.equal(year.ok, true);
});

test("first query value keeps a single string and the first of a list", () => {
  assert.equal(firstQueryValue(undefined), undefined);
  assert.equal(firstQueryValue("2026-09-01"), "2026-09-01");
  assert.equal(firstQueryValue(["2026-09-01", "nope"]), "2026-09-01");
  assert.equal(firstQueryValue([]), undefined);
});

test("overlap includes a post that touches the window on either edge", () => {
  assert.equal(postOverlapsRange("2026-08-28", "2026-09-02", "2026-09-01", "2026-09-30"), true);
  assert.equal(postOverlapsRange("2026-09-30", "2026-10-02", "2026-09-01", "2026-09-30"), true);
  assert.equal(postOverlapsRange("2026-08-01", "2026-08-31", "2026-09-01", "2026-09-30"), false);
  assert.equal(postOverlapsRange("2026-10-01", null, "2026-09-01", "2026-09-30"), false);
  assert.equal(postOverlapsRange("2026-09-01", null, "2026-09-01", "2026-09-30"), true);
  assert.equal(postOverlapsRange("2026-09-10", "2026-09-01", "2026-09-10", "2026-09-10"), true);
  assert.equal(postOverlapsRange("2026-09-10", "2026-09-01", "2026-09-01", "2026-09-05"), false);
});

test("the sheet keeps shoot fields and drops caption, cta, and other pack text", () => {
  const rows = buildShotList([post()], windowQuery);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), [...SHOT_ROW_FIELDS].sort());
  assert.equal(row.hook, "The ridge before breakfast");
  assert.equal(row.shotListAndAngles, "Wide of the dock\nClose on hands");
  assert.equal("caption" in row, false);
  assert.equal("cta" in row, false);
  assert.equal("notes" in row, false);
  assert.equal(formatShotSchedule(row.startsOn, row.endsOn), "September 3, 2026");
  assert.equal(
    formatShotSchedule("2026-09-03", "2026-09-05"),
    "September 3, 2026 – September 5, 2026",
  );
});

test("only In-creation posts are listed until Ready is included", () => {
  const posts = [
    post(),
    post({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Ready reel",
      status: "ready",
      starts_on: "2026-09-04",
    }),
    post({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Still an idea",
      status: "idea",
      starts_on: "2026-09-05",
    }),
    post({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Already out",
      status: "published",
      starts_on: "2026-09-06",
    }),
    post({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Next month",
      starts_on: "2026-10-02",
    }),
    post({
      id: "66666666-6666-4666-8666-666666666666",
      title: "Crossing in",
      starts_on: "2026-08-30",
      ends_on: "2026-09-01",
    }),
  ];

  const defaults = buildShotList(posts, windowQuery).map((row) => row.title);
  assert.deepEqual(defaults, ["Crossing in", "Harbor open"]);

  const withReady = buildShotList(posts, { ...windowQuery, includeReady: true }).map(
    (row) => row.title,
  );
  assert.deepEqual(withReady, ["Crossing in", "Harbor open", "Ready reel"]);
});

test("an empty post list and a post with no hook or angles stay calm", () => {
  assert.deepEqual(buildShotList([], windowQuery), []);
  const rows = buildShotList(
    [
      post({
        hook: "",
        pack: { shot_list_and_angles: "", caption: "", cta: "" },
        platform: "",
      }),
    ],
    windowQuery,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.hook, "");
  assert.equal(rows[0]?.shotListAndAngles, "");
  assert.equal(rows[0]?.platform, "");
});

test("rows sort by date, then title", () => {
  const rows = buildShotList(
    [
      post({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Zebra",
        starts_on: "2026-09-08",
      }),
      post({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        title: "Alpha",
        starts_on: "2026-09-08",
      }),
      post({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        title: "Earlier",
        starts_on: "2026-09-02",
      }),
    ],
    windowQuery,
  );
  assert.deepEqual(
    rows.map((row) => row.title),
    ["Earlier", "Alpha", "Zebra"],
  );
});
