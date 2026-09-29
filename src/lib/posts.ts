import type { PackBody } from "@/lib/pack";

export const POST_STATUSES = ["idea", "in-creation", "ready", "published"] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_FORMATS = ["Reel", "Post", "Carousel", "Story"] as const;

export type PostFormat = (typeof POST_FORMATS)[number];

export const STATUS_LABELS: Record<PostStatus, string> = {
  idea: "Idea",
  "in-creation": "In-creation",
  ready: "Ready",
  published: "Published",
};

export const PLATFORM_SUGGESTIONS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "YouTube",
  "LinkedIn",
] as const;

export const TITLE_MAX = 120;
export const HOOK_MAX = 800;
export const PLATFORM_MAX = 40;

export const POST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Post = {
  id: string;
  title: string;
  hook: string;
  status: PostStatus;
  format: PostFormat;
  platform: string;
  starts_on: string;
  ends_on: string | null;
  pack: PackBody;
};

export function isPostStatus(value: string): value is PostStatus {
  return (POST_STATUSES as readonly string[]).includes(value);
}

export function isPostFormat(value: string): value is PostFormat {
  return (POST_FORMATS as readonly string[]).includes(value);
}
