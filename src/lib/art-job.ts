/**
 * A DOT art job is one row in art_jobs for one post.
 * This module is safe to import from client components: it does not read secrets.
 */

import type { BrandProfile } from "@/lib/brand";
import { MAX_CAROUSEL_IMAGES, type PostMediaKind } from "@/lib/media";
import type { PackBody } from "@/lib/pack";
import { type PostFormat } from "@/lib/posts";

export const ART_JOB_STATUSES = ["queued", "processing", "done", "failed"] as const;

export type ArtJobStatus = (typeof ART_JOB_STATUSES)[number];

export const ART_JOB_NOTES_MAX = 2000;
export const ART_JOB_ERROR_MAX = 2000;

export const ART_JOB_STATUS_LABELS: Record<ArtJobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

export const ART_JOB_COLUMNS =
  "id, client_id, post_id, batch_id, status, error, brief, replace_media, hold_media, created_at, updated_at, completed_at";

export const ART_IN_PROGRESS = "DOT is already working on this pack.";

export const ART_SLOTS_FULL =
  "Every image slot for this type is already filled. Replace the images, or skip.";

export const ART_QUEUED_SLACK = "Queued. DOT was asked in #content to make the images.";

export const ART_QUEUED_SLACK_OTHER = "Queued. DOT was asked in Slack to make the images.";

export const ART_QUEUED_PLUGIN =
  "Queued. DOT can pull this job from the plugin. Slack is not connected on this server yet.";

export const ART_JOBS_UNAVAILABLE =
  "Image generation is not available yet. Apply the latest database migration.";

export type ArtJob = {
  id: string;
  clientId: string;
  postId: string;
  batchId: string | null;
  status: ArtJobStatus;
  error: string | null;
  notes: string | null;
  replace: boolean;
  /** True when new images should wait until the studio accepts them. */
  hold: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ArtJobSnapshot = {
  latest: ArtJob | null;
  open: ArtJob | null;
};

export type ArtSlotPlan = {
  format: PostFormat;
  kind: PostMediaKind;
  count: number;
  filled: number;
  empty: number;
  replace: boolean;
  emptyPositions: number[];
};

export type ArtWritePlan = {
  deleteExisting: boolean;
  inserts: { position: number; imageIndex: number }[];
};

export type ArtBriefPost = {
  title: string;
  hook: string;
  format: PostFormat;
  platform: string;
  pack: PackBody;
};

export function isArtJobStatus(value: string): value is ArtJobStatus {
  return (ART_JOB_STATUSES as readonly string[]).includes(value);
}

export function packPath(slug: string, postId: string): string {
  return `/clients/${slug}/packs/${postId}`;
}

export function artTarget(format: PostFormat): {
  kind: PostMediaKind;
  count: number;
  label: string;
} {
  if (format === "Carousel") {
    return { kind: "carousel", count: MAX_CAROUSEL_IMAGES, label: "carousel slides" };
  }
  if (format === "Reel") {
    return { kind: "cover", count: 1, label: "reel cover" };
  }
  return { kind: "static", count: 1, label: "image" };
}

export function describeArtSlots(input: {
  format: PostFormat;
  positions: number[];
  replace: boolean;
}): ArtSlotPlan {
  const target = artTarget(input.format);
  const used = new Set(
    input.positions.filter(
      (position) => Number.isInteger(position) && position >= 0 && position < target.count,
    ),
  );
  const open: number[] = [];
  for (let position = 0; position < target.count; position += 1) {
    if (!used.has(position)) open.push(position);
  }
  const filled = used.size;
  if (input.replace) {
    return {
      format: input.format,
      kind: target.kind,
      count: target.count,
      filled,
      empty: target.count,
      replace: true,
      emptyPositions: Array.from({ length: target.count }, (_, position) => position),
    };
  }
  return {
    format: input.format,
    kind: target.kind,
    count: target.count,
    filled,
    empty: open.length,
    replace: false,
    emptyPositions: open,
  };
}

export function slotsAreFull(positions: number[], count: number): boolean {
  const used = new Set(
    positions.filter((position) => Number.isInteger(position) && position >= 0 && position < count),
  );
  return used.size >= count;
}

export function planArtWrites(input: {
  occupied: number[];
  incomingCount: number;
  replace: boolean;
  max: number;
}): { ok: true; plan: ArtWritePlan } | { ok: false; error: string } {
  if (input.incomingCount <= 0) {
    return { ok: false, error: "Send at least one image." };
  }
  const take = Math.min(input.incomingCount, input.max);
  if (input.replace) {
    return {
      ok: true,
      plan: {
        deleteExisting: true,
        inserts: Array.from({ length: take }, (_, imageIndex) => ({
          position: imageIndex,
          imageIndex,
        })),
      },
    };
  }

  const used = new Set(input.occupied);
  const inserts: { position: number; imageIndex: number }[] = [];
  for (let position = 0; position < input.max && inserts.length < take; position += 1) {
    if (used.has(position)) continue;
    inserts.push({ position, imageIndex: inserts.length });
  }
  if (inserts.length === 0) {
    return { ok: false, error: "Every image slot is already filled." };
  }
  return { ok: true, plan: { deleteExisting: false, inserts } };
}

export function artJobStatusDetail(status: ArtJobStatus): string {
  switch (status) {
    case "queued":
      return "Queued. Waiting for DOT.";
    case "processing":
      return "DOT is making the images.";
    case "done":
      return "Done. The images are on this pack.";
    case "failed":
      return "DOT could not finish the images.";
  }
}

function pushField(lines: string[], label: string, value: string) {
  const text = value.trim();
  if (text) lines.push(`${label}: ${text}`);
}

function slotNoun(format: PostFormat, count: number): string {
  if (format === "Carousel") {
    return count === 1 ? "1 carousel slide" : `${count} carousel slides`;
  }
  if (format === "Reel") return count === 1 ? "1 reel cover" : `${count} reel covers`;
  return count === 1 ? "1 image" : `${count} images`;
}

function slotInstruction(plan: ArtSlotPlan, hold = false): string {
  if (hold) {
    return `Images to make: a new ${slotNoun(plan.format, plan.count)} for review. Leave the images already on the pack. The studio will accept these or keep the current ones.`;
  }
  if (plan.replace) {
    return `Images to make: replace ${slotNoun(plan.format, plan.count)}.`;
  }
  const places =
    plan.emptyPositions.length > 0 ? ` (positions ${plan.emptyPositions.join(", ")})` : "";
  return `Images to make: ${slotNoun(plan.format, plan.empty)} for empty slots${places}. Leave filled slots alone.`;
}

export function buildArtBrief(input: {
  clientName: string;
  clientSlug: string;
  postId: string;
  brand: BrandProfile;
  post: ArtBriefPost;
  notes: string | null;
  slots: ArtSlotPlan;
  /** When true, DOT draws a new set and the current images stay until accept. */
  hold?: boolean;
}): string {
  const lines: string[] = ["DOT, make the images for this pack."];
  pushField(lines, "Client", `${input.clientName} (${input.clientSlug})`);
  lines.push(`Pack: ${packPath(input.clientSlug, input.postId)}`);
  pushField(lines, "Type", input.post.format);
  pushField(lines, "Platform", input.post.platform);
  lines.push(slotInstruction(input.slots, input.hold === true));

  pushField(lines, "Brand name", input.brand.identity.name);
  pushField(lines, "Tagline", input.brand.identity.tagline);
  pushField(lines, "Positioning", input.brand.identity.positioning);
  pushField(lines, "Audience", input.brand.audience);
  pushField(lines, "Offers", input.brand.offers);
  pushField(lines, "Tone", input.brand.voice.tone);
  pushField(lines, "Caption pattern", input.brand.voice.caption_pattern);
  pushField(lines, "Do", input.brand.do);
  pushField(lines, "Don't", input.brand.dont);
  pushField(lines, "Visual notes", input.brand.visual_notes);
  pushField(lines, "Phrases", input.brand.phrases);
  if (input.brand.colors) {
    const colors = Object.entries(input.brand.colors)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
      .map(([key, value]) => `${key} ${value}`);
    if (colors.length > 0) lines.push(`Colors: ${colors.join(", ")}`);
  }

  pushField(lines, "Post title", input.post.title);
  pushField(lines, "Hook", input.post.hook);
  pushField(lines, "Shot list and angles", input.post.pack.shot_list_and_angles);
  pushField(lines, "Caption", input.post.pack.caption);
  pushField(lines, "Call to action", input.post.pack.cta);
  pushField(lines, "Notes", input.notes ?? "");
  return lines.join("\n");
}

export const SLACK_BRIEF_MAX = 2500;

export function dotSlackText(input: {
  jobId: string;
  postId: string;
  clientSlug: string;
  format: string;
  brief: string;
}): string {
  const brief = input.brief.trim();
  const clipped = brief.length > SLACK_BRIEF_MAX;
  const body = clipped ? `${brief.slice(0, SLACK_BRIEF_MAX)}…` : brief;
  return [
    "DOT, pick up this art job.",
    `Job id: ${input.jobId}`,
    `Post id: ${input.postId}`,
    `Client: ${input.clientSlug}`,
    `Pack: ${packPath(input.clientSlug, input.postId)}`,
    `Format: ${input.format}`,
    "",
    clipped ? "Brief summary:" : "Brief:",
    body || "(No brief text.)",
  ].join("\n");
}

export function readArtRequest(
  formData: FormData,
): { ok: true; notes: string | null; replace: boolean } | { ok: false; error: string } {
  const notes = String(formData.get("notes") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (notes.length > ART_JOB_NOTES_MAX) {
    return { ok: false, error: `Notes must be ${ART_JOB_NOTES_MAX} characters or fewer.` };
  }
  return {
    ok: true,
    notes: notes || null,
    replace: String(formData.get("intent") ?? "") === "replace",
  };
}

export function clipArtError(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (text.length <= ART_JOB_ERROR_MAX) return text;
  return text.slice(0, ART_JOB_ERROR_MAX);
}

export function parseFailReason(
  value: unknown,
): { ok: true; error: string } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Send a JSON object with an error." };
  }
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "string" || !error.trim()) {
    return { ok: false, error: "Say what went wrong." };
  }
  return { ok: true, error: clipArtError(error) };
}

export function artJobsQueryError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205") return ART_JOBS_UNAVAILABLE;
  return error.message;
}

export function artJobFromRow(value: unknown): ArtJob | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const clientId = typeof row.client_id === "string" ? row.client_id : "";
  const postId = typeof row.post_id === "string" ? row.post_id : "";
  const status = typeof row.status === "string" ? row.status : "";
  if (!id || !clientId || !postId || !isArtJobStatus(status)) return null;

  return {
    id,
    clientId,
    postId,
    status,
    error: typeof row.error === "string" && row.error ? row.error : null,
    notes: typeof row.brief === "string" && row.brief ? row.brief : null,
    replace: row.replace_media === true,
    hold: row.hold_media === true,
    batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export function queuedArtMessage(input: { slack: "content" | "other" | "skipped" | "failed"; detail?: string }): string {
  if (input.slack === "content") return ART_QUEUED_SLACK;
  if (input.slack === "other") return ART_QUEUED_SLACK_OTHER;
  if (input.slack === "failed") {
    const detail = input.detail?.trim();
    if (detail) {
      return `Queued. Slack did not get the message (${detail}). DOT can still pull this job from the plugin.`;
    }
    return "Queued. Slack did not get the message. DOT can still pull this job from the plugin.";
  }
  return ART_QUEUED_PLUGIN;
}
