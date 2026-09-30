import { diffDays, formatLongDate, isIsoDate, monthBounds, parseMonthKey } from "@/lib/calendar";
import type { Post, PostFormat, PostStatus } from "@/lib/posts";

/** Inclusive length of the shoot window. A post range stays capped at 62 days. */
export const MAX_SHOT_WINDOW_DAYS = 366;

export const SHOT_ROW_FIELDS = [
  "id",
  "title",
  "hook",
  "status",
  "format",
  "platform",
  "startsOn",
  "endsOn",
  "shotListAndAngles",
] as const;

export type ShotRow = {
  id: string;
  title: string;
  hook: string;
  status: PostStatus;
  format: PostFormat;
  platform: string;
  startsOn: string;
  endsOn: string | null;
  shotListAndAngles: string;
};

export type ShotQuery = {
  from: string;
  to: string;
  includeReady: boolean;
};

export type ShotQueryResult =
  | { ok: true; query: ShotQuery }
  | {
      ok: false;
      error: string;
      from: string;
      to: string;
      includeReady: boolean;
    };

export function defaultShotWindow(now = new Date()): { from: string; to: string } {
  const month = parseMonthKey(undefined, now);
  const bounds = monthBounds(month.year, month.monthIndex);
  return { from: bounds.start, to: bounds.end };
}

export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function shootStatuses(includeReady: boolean): PostStatus[] {
  return includeReady ? ["in-creation", "ready"] : ["in-creation"];
}

export function effectiveEnd(startsOn: string, endsOn: string | null): string {
  return endsOn && endsOn >= startsOn ? endsOn : startsOn;
}

export function postOverlapsRange(
  startsOn: string,
  endsOn: string | null,
  from: string,
  to: string,
): boolean {
  const end = effectiveEnd(startsOn, endsOn);
  return startsOn <= to && end >= from;
}

export function formatShotSchedule(startsOn: string, endsOn: string | null): string {
  const end = effectiveEnd(startsOn, endsOn);
  if (end > startsOn) return `${formatLongDate(startsOn)} – ${formatLongDate(end)}`;
  return formatLongDate(startsOn);
}

function readyFlag(value: string | null | undefined): boolean {
  const flag = value?.trim().toLowerCase() ?? "";
  return flag === "1" || flag === "true" || flag === "on";
}

function dateField(value: string): string {
  return isIsoDate(value) ? value : "";
}

export function parseShotQuery(
  input: { from?: string | null; to?: string | null; ready?: string | null },
  now = new Date(),
): ShotQueryResult {
  const includeReady = readyFlag(input.ready);
  const fromRaw = input.from?.trim() ?? "";
  const toRaw = input.to?.trim() ?? "";
  const from = dateField(fromRaw);
  const to = dateField(toRaw);

  if (!fromRaw && !toRaw) {
    const window = defaultShotWindow(now);
    return { ok: true, query: { ...window, includeReady } };
  }

  if (!from || !to) {
    return {
      ok: false,
      error: "Choose a valid start and end date.",
      from,
      to,
      includeReady,
    };
  }

  if (from > to) {
    return {
      ok: false,
      error: "The end date has to be on or after the start date.",
      from,
      to,
      includeReady,
    };
  }

  const span = diffDays(from, to);
  if (span === null || span + 1 > MAX_SHOT_WINDOW_DAYS) {
    return {
      ok: false,
      error: `A shot list can cover up to ${MAX_SHOT_WINDOW_DAYS} days.`,
      from,
      to,
      includeReady,
    };
  }

  return { ok: true, query: { from, to, includeReady } };
}

function toShotRow(post: Post): ShotRow {
  return {
    id: post.id,
    title: post.title,
    hook: post.hook,
    status: post.status,
    format: post.format,
    platform: post.platform,
    startsOn: post.starts_on,
    endsOn: post.ends_on,
    shotListAndAngles: post.pack.shot_list_and_angles,
  };
}

export function buildShotList(posts: readonly Post[], query: ShotQuery): ShotRow[] {
  const allowed = new Set(shootStatuses(query.includeReady));
  return posts
    .filter(
      (post) =>
        allowed.has(post.status) &&
        postOverlapsRange(post.starts_on, post.ends_on, query.from, query.to),
    )
    .map(toShotRow)
    .sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
}
