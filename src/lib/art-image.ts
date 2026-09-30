/**
 * Turns DOT image URLs or base64 into PNG, JPEG, or WebP bytes.
 * Server-only. URLs must be public https. Private hosts are refused.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_CAROUSEL_IMAGES, MAX_IMAGE_BYTES, type ImageExtension, type ImageMime } from "@/lib/media";

export type ArtImageInput = { kind: "url"; url: string } | { kind: "base64"; base64: string };

export type ArtImageFile = {
  bytes: Uint8Array;
  mime: ImageMime;
  extension: ImageExtension;
};

const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 2000;

export function sniffImage(
  bytes: Uint8Array,
): { mime: ImageMime; extension: ImageExtension } | null {
  if (bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", extension: "png" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((part) => Number(part));
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true;
    }
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped?.[1]) return isBlockedAddress(mapped[1]);
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (Number.isNaN(first)) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xffc0) === 0xfe80) return true;
    return false;
  }
  return true;
}

function blockedHostName(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal") return true;
  return false;
}

export function parsePublicImageUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (blockedHostName(url.hostname)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) return null;
  return url;
}

export function decodeBase64Image(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 15_000_000) return null;
  const dataUrl = /^data:[^,]{0,200};base64,([\s\S]+)$/i.exec(trimmed);
  const payload = (dataUrl?.[1] ?? trimmed).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  return bytes;
}

export function readArtImageInput(value: unknown): ArtImageInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.url === "string" && row.url.trim()) {
    return { kind: "url", url: row.url.trim() };
  }
  if (typeof row.base64 === "string" && row.base64.trim()) {
    return { kind: "base64", base64: row.base64.trim() };
  }
  return null;
}

export function parseCompleteImages(
  value: unknown,
): { ok: true; images: ArtImageInput[] } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Send a JSON object with an images list." };
  }
  const images = (value as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, error: "Send at least one image." };
  }
  if (images.length > MAX_CAROUSEL_IMAGES) {
    return { ok: false, error: "Send at most 10 images." };
  }
  const parsed: ArtImageInput[] = [];
  for (const item of images) {
    const image = readArtImageInput(item);
    if (!image) {
      return { ok: false, error: "Each image needs a url or base64 field. A url is preferred." };
    }
    parsed.push(image);
  }
  return { ok: true, images: parsed };
}

async function readLimited(response: Response, max: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > max ? null : buffer;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function downloadArtImage(
  rawUrl: string,
  deps: {
    fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    lookup?: (host: string) => Promise<string[]>;
  } = {},
): Promise<{ ok: true; file: ArtImageFile } | { ok: false; error: string }> {
  const fetchImpl = deps.fetch ?? fetch;
  const resolve =
    deps.lookup ??
    (async (host: string) => {
      if (isIP(host)) return [host];
      const found = await lookup(host, { all: true, verbatim: true });
      return found.map((item) => item.address);
    });

  let current = parsePublicImageUrl(rawUrl);
  if (!current) {
    return { ok: false, error: "Image links must be public https URLs." };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const host = current.hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, error: "That image link could not be reached." };
    }
    if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
      return { ok: false, error: "Image links must be public https URLs." };
    }

    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
        headers: { Accept: "image/png,image/jpeg,image/webp,*/*" },
      });
    } catch {
      return { ok: false, error: "That image link could not be reached." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return { ok: false, error: "That image link could not be reached." };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { ok: false, error: "Image links must be public https URLs." };
      }
      const parsed = parsePublicImageUrl(next.toString());
      if (!parsed) return { ok: false, error: "Image links must be public https URLs." };
      current = parsed;
      continue;
    }

    if (!response.ok) {
      return { ok: false, error: "That image link could not be reached." };
    }

    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Each image must be 10MB or smaller." };
    }

    const bytes = await readLimited(response, MAX_IMAGE_BYTES);
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false, error: "Each image must be 10MB or smaller." };
    }
    const sniffed = sniffImage(bytes);
    if (!sniffed) {
      return { ok: false, error: "That file is not a PNG, JPEG, or WebP image." };
    }
    return { ok: true, file: { bytes, ...sniffed } };
  }

  return { ok: false, error: "That image link could not be reached." };
}

export function fileFromBase64(
  value: string,
): { ok: true; file: ArtImageFile } | { ok: false; error: string } {
  const bytes = decodeBase64Image(value);
  if (!bytes) return { ok: false, error: "That base64 image could not be read. A url is preferred." };
  const sniffed = sniffImage(bytes);
  if (!sniffed) return { ok: false, error: "That file is not a PNG, JPEG, or WebP image." };
  return { ok: true, file: { bytes, ...sniffed } };
}

export async function collectArtFiles(
  images: ArtImageInput[],
  deps?: {
    fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    lookup?: (host: string) => Promise<string[]>;
  },
): Promise<{ ok: true; files: ArtImageFile[] } | { ok: false; error: string }> {
  const files: ArtImageFile[] = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image) continue;
    const loaded =
      image.kind === "url" ? await downloadArtImage(image.url, deps) : fileFromBase64(image.base64);
    if (!loaded.ok) {
      return { ok: false, error: `Image ${index + 1}: ${loaded.error}` };
    }
    files.push(loaded.file);
  }
  if (files.length === 0) return { ok: false, error: "Send at least one image." };
  return { ok: true, files };
}
