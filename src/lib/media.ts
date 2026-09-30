import { POST_ID_RE, type PostFormat } from "@/lib/posts";

/**
 * Where a post image came from.
 * `upload` is a file a person chose.
 * `dot` is an image DOT returned into an existing slot.
 * Same post_media rows. There is not a second board.
 */
export const MEDIA_SOURCES = ["upload", "dot"] as const;

export type MediaSource = (typeof MEDIA_SOURCES)[number];

export const POST_MEDIA_BUCKET = "post-media";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const MAX_CAROUSEL_IMAGES = 10;

/** Preview links in the pack editor. */
export const PREVIEW_URL_SECONDS = 60 * 60;

/**
 * Links in the GHL CSV. Social Planner fetches them on import, so they
 * need to stay valid long enough to upload the file.
 */
export const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type ImageMime = keyof typeof IMAGE_EXTENSIONS;

export type ImageExtension = (typeof IMAGE_EXTENSIONS)[ImageMime];

export const POST_MEDIA_KINDS = ["carousel", "static", "cover"] as const;

export type PostMediaKind = (typeof POST_MEDIA_KINDS)[number];

export function isPostMediaKind(value: string): value is PostMediaKind {
  return (POST_MEDIA_KINDS as readonly string[]).includes(value);
}

export function inspectImageFile(file: {
  type: string;
  size: number;
}):
  | { ok: true; mime: ImageMime; extension: ImageExtension }
  | { ok: false; error: string } {
  if (file.type.startsWith("video/")) {
    return {
      ok: false,
      error: "Video files are not accepted. Upload a PNG, JPEG, or WebP image.",
    };
  }

  const extension = IMAGE_EXTENSIONS[file.type as ImageMime];
  if (!extension) {
    return { ok: false, error: "Upload a PNG, JPEG, or WebP image." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Each image must be 10MB or smaller." };
  }

  return { ok: true, mime: file.type as ImageMime, extension };
}

export function mediaObjectPath(input: {
  agencyId: string;
  clientId: string;
  postId: string;
  mediaId: string;
  extension: ImageExtension;
}): string {
  const ids = [input.agencyId, input.clientId, input.postId, input.mediaId];
  if (ids.some((id) => !POST_ID_RE.test(id))) {
    throw new Error("Invalid media path.");
  }
  return `${input.agencyId}/${input.clientId}/${input.postId}/${input.mediaId}.${input.extension}`;
}

/** Which image slots the pack editor shows for a saved or selected type. */
export function slotsForFormat(format: PostFormat): {
  images: "carousel" | "static" | null;
  cover: true;
} {
  if (format === "Carousel") return { images: "carousel", cover: true };
  if (format === "Reel") return { images: null, cover: true };
  return { images: "static", cover: true };
}
