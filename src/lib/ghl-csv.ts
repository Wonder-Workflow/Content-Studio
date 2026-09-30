import type { PostMediaKind } from "@/lib/media";
import type { PostFormat } from "@/lib/posts";

/**
 * Field-name row from GoHighLevel's Advance CSV sample
 * (social-media-posting/advance-sample.csv, May 2025), plus thumbnailUrl.
 * The May 2026 help article added thumbnailUrl. It sits after videoUrls.
 * The sample's first row is only a visual grouping (All Social, Facebook, …)
 * and is not included, so postAtSpecificTime is the header row.
 * Facebook's `type (post/story/reel)` column comes before Instagram's.
 */
export const GHL_ADVANCE_HEADERS = [
  "postAtSpecificTime (YYYY-MM-DD HH:mm:ss)",
  "content",
  "OGmetaUrl (url)",
  "imageUrls (comma-separated)",
  "gifUrl",
  "videoUrls (comma-separated)",
  "thumbnailUrl",
  "mediaOptimization (true/false)",
  "applyWatermark (true/false)",
  "tags (comma-separated)",
  "category",
  "followUpComment",
  "type (post/story/reel)",
  "type (post/story/reel)",
  "pdfTitle",
  "postAsPdf (true/false)",
  "eventType (call_to_action/event/offer)",
  "actionType (none/order/book/shop/learn_more/call/sign_up)",
  "title",
  "offerTitle",
  "startDate (YYYY-MM-DD HH:mm:ss)",
  "endDate (YYYY-MM-DD HH:mm:ss)",
  "termsConditions",
  "couponCode",
  "redeemOnlineUrl",
  "actionUrl",
  "title",
  "privacyLevel (private/public/unlisted)",
  "type (video/short)",
  "privacyLevel (everyone/friends/only_me)",
  "promoteOtherBrand (true/false)",
  "enableComment (true/false)",
  "enableDuet (true/false)",
  "enableStitch (true/false)",
  "videoDisclosure (true/false)",
  "promoteYourBrand (true/false)",
  "title",
  "notifyAllGroupMembers (true/false)",
  "title",
  "link",
] as const;

export const GHL_FACEBOOK_TYPE_INDEX = 12;
export const GHL_INSTAGRAM_TYPE_INDEX = 13;

/** Posts store a date. The CSV needs a time. GHL reads this in the location timezone. */
export const GHL_SCHEDULE_TIME = "09:00:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GhlMediaUrl = {
  kind: PostMediaKind;
  position: number;
  url: string;
};

export type GhlCsvPost = {
  startsOn: string;
  caption: string;
  format: PostFormat;
  platform: string;
  media: readonly GhlMediaUrl[];
};

type ColumnRole =
  | "schedule"
  | "content"
  | "images"
  | "videos"
  | "thumbnail"
  | "optimization"
  | "facebookType"
  | "instagramType"
  | "empty";

const COLUMN_ROLES: readonly ColumnRole[] = [
  "schedule",
  "content",
  "empty",
  "images",
  "empty",
  "videos",
  "thumbnail",
  "optimization",
  "empty",
  "empty",
  "empty",
  "empty",
  "facebookType",
  "instagramType",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
  "empty",
];

if (COLUMN_ROLES.length !== GHL_ADVANCE_HEADERS.length) {
  throw new Error("GHL columns and headers must match.");
}

function ghlType(format: PostFormat): "post" | "story" | "reel" {
  if (format === "Reel") return "reel";
  if (format === "Story") return "story";
  return "post";
}

function platformName(platform: string) {
  return platform.trim().toLowerCase();
}

function orderedUrls(media: readonly GhlMediaUrl[], kind: PostMediaKind, limit: number) {
  return media
    .filter((item) => item.kind === kind && item.url)
    .sort((a, b) => a.position - b.position)
    .slice(0, limit)
    .map((item) => item.url);
}

export function csvField(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function ghlRowCells(post: GhlCsvPost): string[] {
  const platform = platformName(post.platform);
  const type = ghlType(post.format);
  const imageUrls =
    post.format === "Carousel"
      ? orderedUrls(post.media, "carousel", 10).join(", ")
      : post.format === "Post" || post.format === "Story"
        ? (orderedUrls(post.media, "static", 1)[0] ?? "")
        : "";
  const thumbnail = orderedUrls(post.media, "cover", 1)[0] ?? "";
  const schedule = DATE_RE.test(post.startsOn) ? `${post.startsOn} ${GHL_SCHEDULE_TIME}` : "";

  return COLUMN_ROLES.map((role) => {
    if (role === "schedule") return schedule;
    if (role === "content") return post.caption;
    if (role === "images") return imageUrls;
    if (role === "videos") return "";
    if (role === "thumbnail") return thumbnail;
    if (role === "optimization") return "";
    if (role === "facebookType") return platform === "facebook" ? type : "";
    if (role === "instagramType") return platform === "instagram" ? type : "";
    return "";
  });
}

export function buildGhlCsv(posts: readonly GhlCsvPost[]) {
  const lines = [
    GHL_ADVANCE_HEADERS.join(","),
    ...posts.map((post) => ghlRowCells(post).map(csvField).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}
