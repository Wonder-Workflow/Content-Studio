const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Inclusive length of a post that covers more than one day. */
export const MAX_RANGE_DAYS = 62;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type MonthParts = {
  year: number;
  monthIndex: number;
  key: string;
};

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isIsoDate(iso: string): boolean {
  return parseIsoDate(iso) !== null;
}

export function diffDays(startIso: string, endIso: string): number | null {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return null;
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}

export function addDays(iso: string, days: number): string | null {
  const date = parseIsoDate(iso);
  if (!date || !Number.isInteger(days)) return null;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return toIsoDate(next);
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(value: string | undefined, now = new Date()): MonthParts {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return { year, monthIndex: month - 1, key: value };
    }
  }
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
    key: currentMonthKey(now),
  };
}

export function shiftMonth(year: number, monthIndex: number, delta: number): string {
  const next = new Date(year, monthIndex + delta, 1);
  return currentMonthKey(next);
}

export function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  return {
    start: toIsoDate(new Date(year, monthIndex, 1)),
    end: toIsoDate(new Date(year, monthIndex + 1, 0)),
  };
}

export type MonthCell = { iso: string | null };

export function buildMonthGrid(year: number, monthIndex: number): MonthCell[] {
  const first = new Date(year, monthIndex, 1);
  const lead = first.getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: MonthCell[] = [];
  for (let index = 0; index < lead; index += 1) cells.push({ iso: null });
  for (let day = 1; day <= days; day += 1) {
    cells.push({ iso: toIsoDate(new Date(year, monthIndex, day)) });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null });
  return cells;
}

export function coversDay(startsOn: string, endsOn: string | null, iso: string): boolean {
  const end = endsOn && endsOn >= startsOn ? endsOn : startsOn;
  return startsOn <= iso && iso <= end;
}

export function rangePosition(
  startsOn: string,
  endsOn: string | null,
  iso: string,
): { day: number; total: number } | null {
  if (!coversDay(startsOn, endsOn, iso)) return null;
  const end = endsOn && endsOn >= startsOn ? endsOn : startsOn;
  const total = diffDays(startsOn, end);
  const day = diffDays(startsOn, iso);
  if (total === null || day === null) return null;
  return { day: day + 1, total: total + 1 };
}

export function normalizeRange(
  startsOn: string,
  endsOn: string | null,
): { ok: true; startsOn: string; endsOn: string | null } | { ok: false; error: string } {
  if (!isIsoDate(startsOn)) return { ok: false, error: "Choose a start date." };
  const trimmedEnd = endsOn?.trim() ? endsOn.trim() : null;
  if (trimmedEnd && !isIsoDate(trimmedEnd)) {
    return { ok: false, error: "Choose a valid end date." };
  }
  if (trimmedEnd && trimmedEnd < startsOn) {
    return { ok: false, error: "The end date has to be on or after the start date." };
  }
  const end = trimmedEnd === startsOn ? null : trimmedEnd;
  if (end) {
    const span = diffDays(startsOn, end);
    if (span === null || span + 1 > MAX_RANGE_DAYS) {
      return { ok: false, error: `A post can cover up to ${MAX_RANGE_DAYS} days.` };
    }
  }
  return { ok: true, startsOn, endsOn: end };
}
