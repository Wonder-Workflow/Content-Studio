/**
 * Generate batch: one window of draft packs for a client.
 * Copy comes from the saved brand and the style note. This module does not
 * call an image model. DOT still draws images through art_jobs.
 * Safe to import from client components.
 */

import type { BrandProfile } from "@/lib/brand";
import { addDays, diffDays, isIsoDate, parseIsoDate, toIsoDate } from "@/lib/calendar";
import { inspectImageFile, POST_MEDIA_BUCKET, type ImageExtension } from "@/lib/media";
import { CAPTION_MAX, CTA_MAX, SHOT_LIST_MAX, type PackBody } from "@/lib/pack";
import { HOOK_MAX, POST_ID_RE, TITLE_MAX } from "@/lib/posts";

export const BATCH_REFERENCE_BUCKET = "batch-references";

export const BATCH_WINDOWS = ["1-week", "2-weeks", "1-month", "custom"] as const;

export type BatchWindow = (typeof BATCH_WINDOWS)[number];

export const BATCH_FORMATS = ["Carousel", "Post", "Reel"] as const;

export type BatchFormat = (typeof BATCH_FORMATS)[number];

/** Counts per post type for each 7-day block in the window. */
export type BatchMix = Record<BatchFormat, number>;

export const DEFAULT_BATCH_MIX: BatchMix = { Carousel: 1, Post: 3, Reel: 0 };

export const MIX_PER_TYPE_MAX = 7;
export const MIX_PER_WEEK_MAX = 14;
export const BATCH_MAX_POSTS = 40;
export const BATCH_MAX_DAYS = 62;
export const STYLE_NOTE_MAX = 2000;
export const REVISION_NOTE_MAX = 2000;
export const REFERENCE_URL_MAX = 8;
export const REFERENCE_URL_LENGTH = 500;
export const REFERENCE_IMAGE_MAX = 4;

export const BATCH_UNAVAILABLE =
  "Batch generation is not available yet. Apply the latest database migration.";

export type PlannedSlot = {
  format: BatchFormat;
  startsOn: string;
  sequence: number;
};

export type DraftPack = {
  format: BatchFormat;
  startsOn: string;
  title: string;
  hook: string;
  platform: string;
  pack: PackBody;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ART_REQUEST =
  /\b(image|images|slide|slides|photo|photos|picture|pictures|tone|tones|color|colors|colour|colours|warm|warmer|cool|cooler|art|redo|cover|visual|visuals|look|style|lighting)\b/i;

export function isBatchWindow(value: string): value is BatchWindow {
  return (BATCH_WINDOWS as readonly string[]).includes(value);
}

export function mixTotal(mix: BatchMix): number {
  return mix.Carousel + mix.Post + mix.Reel;
}

export function batchQueryError(error: { code?: string; message: string }): string {
  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  ) {
    return BATCH_UNAVAILABLE;
  }
  return error.message;
}

function clipBlock(text: string, max: number): string {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  const sliced = clean.slice(0, Math.max(0, max - 1)).trimEnd();
  return sliced ? `${sliced}…` : clean.slice(0, max);
}

function clipLine(text: string, max: number): string {
  return clipBlock(text.replace(/[ \t]+/g, " ").replace(/ *\n */g, " "), max);
}

function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function addMonths(iso: string, months: number): string | null {
  const date = parseIsoDate(iso);
  if (!date || !Number.isInteger(months)) return null;
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return toIsoDate(next);
}

export function windowForPreset(
  preset: Exclude<BatchWindow, "custom">,
  today: string,
): { start: string; end: string } | null {
  if (!isIsoDate(today)) return null;
  if (preset === "1-week") {
    const end = addDays(today, 6);
    return end ? { start: today, end } : null;
  }
  if (preset === "2-weeks") {
    const end = addDays(today, 13);
    return end ? { start: today, end } : null;
  }
  const next = addMonths(today, 1);
  if (!next) return null;
  const end = addDays(next, -1);
  return end ? { start: today, end } : null;
}

function readCount(
  raw: string,
  label: string,
): { ok: true; count: number } | { ok: false; error: string } {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: `${label} needs a whole number from 0 to ${MIX_PER_TYPE_MAX}.` };
  }
  const count = Number(text);
  if (count > MIX_PER_TYPE_MAX) {
    return { ok: false, error: `${label} can be at most ${MIX_PER_TYPE_MAX} per week.` };
  }
  return { ok: true, count };
}

export function readMix(input: {
  carousel: string;
  staticCount: string;
  reel: string;
}): { ok: true; mix: BatchMix } | { ok: false; error: string } {
  const carousel = readCount(input.carousel, "Carousels");
  if (!carousel.ok) return carousel;
  const staticCount = readCount(input.staticCount, "Static posts");
  if (!staticCount.ok) return staticCount;
  const reel = readCount(input.reel, "Reel covers");
  if (!reel.ok) return reel;
  const mix: BatchMix = {
    Carousel: carousel.count,
    Post: staticCount.count,
    Reel: reel.count,
  };
  const total = mixTotal(mix);
  if (total < 1) return { ok: false, error: "Choose at least one post per week." };
  if (total > MIX_PER_WEEK_MAX) {
    return { ok: false, error: `A week can include at most ${MIX_PER_WEEK_MAX} posts.` };
  }
  return { ok: true, mix };
}

export function readBatchWindow(input: {
  preset: string;
  today: string;
  customStart: string;
  customEnd: string;
}): { ok: true; start: string; end: string } | { ok: false; error: string } {
  if (!isBatchWindow(input.preset)) return { ok: false, error: "Choose a window." };
  if (input.preset === "custom") {
    if (!isIsoDate(input.customStart) || !isIsoDate(input.customEnd)) {
      return { ok: false, error: "Choose a start and end date." };
    }
    if (input.customEnd < input.customStart) {
      return { ok: false, error: "The end date has to be on or after the start date." };
    }
    return { ok: true, start: input.customStart, end: input.customEnd };
  }
  const today = isIsoDate(input.today) ? input.today : toIsoDate(new Date());
  const window = windowForPreset(input.preset, today);
  if (!window) return { ok: false, error: "Choose a window." };
  return { ok: true, ...window };
}

export function readStyleNote(
  value: string,
): { ok: true; note: string } | { ok: false; error: string } {
  const note = value.replace(/\r\n/g, "\n").trim();
  if (note.length > STYLE_NOTE_MAX) {
    return { ok: false, error: `Style direction must be ${STYLE_NOTE_MAX} characters or fewer.` };
  }
  return { ok: true, note };
}

export function readRevisionNote(
  value: string,
): { ok: true; note: string } | { ok: false; error: string } {
  const note = value.replace(/\r\n/g, "\n").trim();
  if (!note) return { ok: false, error: "Say what should change." };
  if (note.length > REVISION_NOTE_MAX) {
    return { ok: false, error: `That note must be ${REVISION_NOTE_MAX} characters or fewer.` };
  }
  return { ok: true, note };
}

export function readReferenceUrls(
  value: string,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  const lines = value
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > REFERENCE_URL_MAX) {
    return { ok: false, error: `Add up to ${REFERENCE_URL_MAX} reference links.` };
  }
  const urls: string[] = [];
  for (const line of lines) {
    if (line.length > REFERENCE_URL_LENGTH) {
      return { ok: false, error: "Each reference link must be 500 characters or fewer." };
    }
    let parsed: URL;
    try {
      parsed = new URL(line);
    } catch {
      return { ok: false, error: "Each reference must be a full https link." };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Each reference must be a full https link." };
    }
    urls.push(parsed.toString());
  }
  return { ok: true, urls };
}

export function referenceUrlsFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function mixFromRow(value: unknown): BatchMix | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const mix = { Carousel: row.Carousel, Post: row.Post, Reel: row.Reel };
  if (!Object.values(mix).every((count) => typeof count === "number" && Number.isInteger(count))) {
    return null;
  }
  return mix as BatchMix;
}

function scaleCount(count: number, days: number): number {
  if (count <= 0 || days <= 0) return 0;
  if (days >= 7) return count;
  return Math.round((count * days) / 7);
}

function interleave(mix: BatchMix): BatchFormat[] {
  const queues: Record<BatchFormat, BatchFormat[]> = {
    Post: Array.from({ length: mix.Post }, () => "Post"),
    Carousel: Array.from({ length: mix.Carousel }, () => "Carousel"),
    Reel: Array.from({ length: mix.Reel }, () => "Reel"),
  };
  const order: BatchFormat[] = ["Post", "Carousel", "Reel"];
  const formats: BatchFormat[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const format of order) {
      const next = queues[format].shift();
      if (!next) continue;
      formats.push(next);
      added = true;
    }
  }
  return formats;
}

function spreadDates(days: string[], count: number): string[] {
  if (count <= 0 || days.length === 0) return [];
  const dates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const slot = Math.round(((index + 0.5) * days.length) / count - 0.5);
    const clamped = Math.min(days.length - 1, Math.max(0, slot));
    const day = days[clamped];
    if (day) dates.push(day);
  }
  return dates;
}

export function planBatch(
  start: string,
  end: string,
  mix: BatchMix,
): { ok: true; slots: PlannedSlot[] } | { ok: false; error: string } {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
    return { ok: false, error: "Choose a valid date range." };
  }
  const span = diffDays(start, end);
  if (span === null) return { ok: false, error: "Choose a valid date range." };
  const days = span + 1;
  if (days > BATCH_MAX_DAYS) {
    return { ok: false, error: `A batch can cover up to ${BATCH_MAX_DAYS} days.` };
  }
  if (mixTotal(mix) < 1) return { ok: false, error: "Choose at least one post per week." };

  const slots: PlannedSlot[] = [];
  const sequences: Record<BatchFormat, number> = { Carousel: 0, Post: 0, Reel: 0 };
  for (let offset = 0; offset < days; offset += 7) {
    const blockLength = Math.min(7, days - offset);
    const counts: BatchMix = {
      Carousel: scaleCount(mix.Carousel, blockLength),
      Post: scaleCount(mix.Post, blockLength),
      Reel: scaleCount(mix.Reel, blockLength),
    };
    const formats = interleave(counts);
    const blockDays: string[] = [];
    for (let index = 0; index < blockLength; index += 1) {
      const iso = addDays(start, offset + index);
      if (iso) blockDays.push(iso);
    }
    const dates = spreadDates(blockDays, formats.length);
    formats.forEach((format, index) => {
      const startsOn = dates[index];
      if (!startsOn) return;
      sequences[format] += 1;
      slots.push({ format, startsOn, sequence: sequences[format] });
    });
  }

  if (slots.length === 0) {
    return {
      ok: false,
      error: "That window is too short for this mix. Add more days or raise the counts.",
    };
  }
  if (slots.length > BATCH_MAX_POSTS) {
    return {
      ok: false,
      error: `That mix would make ${slots.length} posts. A batch can make up to ${BATCH_MAX_POSTS}. Lower the counts or shorten the window.`,
    };
  }
  return { ok: true, slots };
}

function offerLine(brand: BrandProfile, sequence: number): string {
  const offers = linesOf(brand.offers);
  if (offers.length > 0) return offers[(sequence - 1) % offers.length] ?? offers[0] ?? "This week";
  return brand.identity.name || "This week";
}

function phraseLine(brand: BrandProfile, sequence: number): string {
  const phrases = linesOf(brand.phrases);
  if (phrases.length === 0) return "";
  return phrases[(sequence - 1) % phrases.length] ?? "";
}

function shotStub(input: {
  format: BatchFormat;
  offer: string;
  visual: string;
  styleNote: string;
  referenceUrls: string[];
}): string {
  const style = input.styleNote.trim();
  const refs =
    input.referenceUrls.length > 0
      ? `Match the reference: ${input.referenceUrls.join(", ")}.`
      : "";
  const direction = [style ? `Style: ${style}` : "", refs].filter(Boolean).join("\n");
  if (input.format === "Carousel") {
    return [
      `Slide 1 — cover. ${input.visual}`,
      `Slide 2 — the offer: ${input.offer}.`,
      "Slide 3 — a detail or proof.",
      "Slide 4 — how it feels in the room.",
      "Slide 5 — close on the call to action.",
      direction,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (input.format === "Reel") {
    return [
      `Cover frame only. ${input.visual}`,
      "Center the subject. Keep the top and bottom clear.",
      direction,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `One frame. ${input.visual}`,
    `Subject: ${input.offer}.`,
    "Angle: straight-on, with room for the hook.",
    direction,
  ]
    .filter(Boolean)
    .join("\n");
}

export function draftPackCopy(input: {
  brand: BrandProfile;
  format: BatchFormat;
  startsOn: string;
  sequence: number;
  styleNote: string;
  referenceUrls: string[];
}): { title: string; hook: string; platform: string; pack: PackBody } {
  const offer = offerLine(input.brand, input.sequence);
  const phrase = phraseLine(input.brand, input.sequence);
  const name = input.brand.identity.name || "the brand";
  const style = input.styleNote.trim();
  const visual =
    input.brand.visual_notes.trim() || "Natural light, on-brand colors, no extra logos.";
  const label = input.format === "Post" ? "Post" : input.format === "Reel" ? "Reel" : "Carousel";
  const title = clipLine(
    `${shortDate(input.startsOn)} · ${label} ${input.sequence} · ${offer}`,
    TITLE_MAX,
  );
  const hookSource =
    input.brand.identity.positioning ||
    input.brand.identity.tagline ||
    phrase ||
    `A ${label.toLowerCase()} for ${name}.`;
  const hook = clipBlock(style ? `${hookSource}\n\n${style}` : hookSource, HOOK_MAX);
  const captionParts: string[] = [];
  if (input.brand.voice.caption_pattern.trim()) {
    captionParts.push(input.brand.voice.caption_pattern.trim());
  } else {
    if (input.brand.identity.tagline.trim()) captionParts.push(input.brand.identity.tagline.trim());
    captionParts.push(offer);
    if (input.brand.audience.trim()) captionParts.push(input.brand.audience.trim());
  }
  if (style) captionParts.push(style);
  const caption = clipBlock(captionParts.join("\n\n"), CAPTION_MAX);
  const cta = clipLine(phrase || "See what's new.", CTA_MAX);
  const shot = clipBlock(
    shotStub({
      format: input.format,
      offer,
      visual,
      styleNote: style,
      referenceUrls: input.referenceUrls,
    }),
    SHOT_LIST_MAX,
  );
  return {
    title: title || `${label} ${input.sequence}`,
    hook,
    platform: "Instagram",
    pack: { shot_list_and_angles: shot, caption, cta },
  };
}

export function draftsForPlan(input: {
  brand: BrandProfile;
  slots: PlannedSlot[];
  styleNote: string;
  referenceUrls: string[];
}): DraftPack[] {
  return input.slots.map((slot) => {
    const copy = draftPackCopy({
      brand: input.brand,
      format: slot.format,
      startsOn: slot.startsOn,
      sequence: slot.sequence,
      styleNote: input.styleNote,
      referenceUrls: input.referenceUrls,
    });
    return { format: slot.format, startsOn: slot.startsOn, ...copy };
  });
}

export function batchBriefNotes(input: {
  styleNote: string;
  referenceUrls: string[];
  referenceImageUrls: string[];
  revisionNote?: string | null;
}): string {
  const lines: string[] = [];
  const style = input.styleNote.trim();
  if (style) lines.push(`Style direction: ${style}`);
  if (input.referenceUrls.length > 0) {
    lines.push("Style references:");
    for (const url of input.referenceUrls) lines.push(url);
  }
  if (input.referenceImageUrls.length > 0) {
    lines.push("Reference images (copy this structure and look):");
    for (const url of input.referenceImageUrls) lines.push(url);
  }
  const revision = input.revisionNote?.trim() ?? "";
  if (revision) lines.push(`Revision: ${revision}`);
  return lines.join("\n");
}

export function revisionQueuesArt(note: string): boolean {
  return ART_REQUEST.test(note);
}

function appendRevision(text: string, note: string, max: number): string {
  const line = `Revision: ${note.trim()}`;
  const base = text.trim();
  if (!base) return clipBlock(line, max);
  const next = `${base}\n\n${line}`;
  if (next.length <= max) return next;
  const room = max - line.length - 2;
  if (room < 1) return clipBlock(line, max);
  return `${clipBlock(base, room)}\n\n${line}`;
}

function reviseShotList(current: string, note: string, max: number): string {
  const slide = /\bslide\s+(\d+)\b/i.exec(note);
  if (slide?.[1]) {
    const pattern = new RegExp(`^Slide\\s+${slide[1]}\\b`, "i");
    const rows = current.split("\n");
    const index = rows.findIndex((row) => pattern.test(row.trim()));
    if (index >= 0) {
      const next = rows.slice();
      next[index] = `${rows[index]?.trim() ?? ""} — ${note.trim()}`;
      const joined = next.join("\n");
      if (joined.length <= max) return joined;
    }
  }
  return appendRevision(current, note, max);
}

export function applyRevision(
  current: { title: string; hook: string; pack: PackBody },
  note: string,
): { title: string; hook: string; pack: PackBody; queueArt: boolean } {
  const trimmed = note.replace(/\r\n/g, "\n").trim();
  const titleTo = /(?:change|set|update|make)?\s*(?:the\s+)?title\s+to\s+([\s\S]+)$/i.exec(trimmed);
  const hookTo = /(?:change|set|update|make)?\s*(?:the\s+)?hook\s+to\s+([\s\S]+)$/i.exec(trimmed);
  const mentions = {
    title: /\btitle\b/i.test(trimmed),
    hook: /\bhook\b/i.test(trimmed),
    caption: /\bcaption\b/i.test(trimmed),
    cta: /\b(cta|call to action)\b/i.test(trimmed),
    shots:
      /\b(shot|shots|slide|slides|angle|angles|visual|visuals|tone|tones|color|colors|colour|colours|warm|warmer|cool|cooler|cover|look|style|image|images|photo|photos|lighting)\b/i.test(
        trimmed,
      ),
  };
  const specific = Object.values(mentions).some(Boolean);
  const title = mentions.title
    ? clipLine(titleTo?.[1] ?? trimmed, TITLE_MAX)
    : current.title;
  const hook =
    !specific || mentions.hook
      ? hookTo?.[1]
        ? clipBlock(hookTo[1], HOOK_MAX)
        : appendRevision(current.hook, trimmed, HOOK_MAX)
      : current.hook;
  const caption =
    !specific || mentions.caption
      ? appendRevision(current.pack.caption, trimmed, CAPTION_MAX)
      : current.pack.caption;
  const cta = mentions.cta
    ? clipLine(trimmed, CTA_MAX)
    : current.pack.cta;
  const shots =
    !specific || mentions.shots
      ? reviseShotList(current.pack.shot_list_and_angles, trimmed, SHOT_LIST_MAX)
      : current.pack.shot_list_and_angles;
  return {
    title: title || current.title,
    hook,
    pack: { shot_list_and_angles: shots, caption, cta },
    queueArt: revisionQueuesArt(trimmed),
  };
}

export function referenceObjectPath(input: {
  agencyId: string;
  clientId: string;
  batchId: string;
  mediaId: string;
  extension: ImageExtension;
}): string {
  const ids = [input.agencyId, input.clientId, input.batchId, input.mediaId];
  if (ids.some((id) => !POST_ID_RE.test(id))) {
    throw new Error("Invalid reference path.");
  }
  return `${input.agencyId}/${input.clientId}/${input.batchId}/${input.mediaId}.${input.extension}`;
}

export function readReferenceFiles(
  entries: FormDataEntryValue[],
): { ok: true; files: File[] } | { ok: false; error: string } {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > REFERENCE_IMAGE_MAX) {
    return { ok: false, error: `Upload up to ${REFERENCE_IMAGE_MAX} reference images.` };
  }
  for (const file of files) {
    const inspected = inspectImageFile({ type: file.type, size: file.size });
    if (!inspected.ok) return inspected;
  }
  return { ok: true, files };
}

/** Post image bucket. Re-exported so batch code can talk about both stores. */
export const POST_IMAGES_BUCKET = POST_MEDIA_BUCKET;
