import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { isBlockedAddress, sniffImage } from "@/lib/art-image";
import type { DotFileRule } from "@/lib/dot-mcp-config";

export type DotFileReference = { download_url: string; file_id: string; mime_type?: string; file_name?: string };
export const MAX_DOT_FILE_BYTES = 2_900_000;

export function approvedDotFileUrl(raw: string, rules: DotFileRule[]): URL | null {
  try {
    if (raw.length > 8000 || /[\\\s]/.test(raw) || /%(?:2e|2f|5c)/i.test(raw)) return null;
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || isIP(url.hostname)
      || url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".localhost")) return null;
    return rules.some((rule) => url.origin === rule.origin && url.pathname.startsWith(rule.pathPrefix)) ? url : null;
  } catch { return null; }
}

export function publicDotAddress(ip: string) {
  if (isIP(ip) !== 4 || isBlockedAddress(ip)) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(a === 192 && (b === 0 || (b === 2) || (b === 88 && c === 99)))
    && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    && !(a === 203 && b === 0 && c === 113);
}

/** Resolve once, reject non-public answers, and pin that address for TLS transport. */
export async function downloadDotFile(url: URL, limit: number): Promise<Uint8Array> {
  const answers = await lookup(url.hostname, { all: true, family: 4 });
  if (!answers.length || answers.some((answer) => !publicDotAddress(answer.address))) throw new Error("File host is unavailable");
  const address = answers[0].address;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET", family: 4,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      // No caller headers, cookies or OAuth/callback bearer are forwarded.
    }, (response) => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error("File download refused")); return; }
      const length = Number(response.headers["content-length"]);
      if (Number.isFinite(length) && length > limit) { response.destroy(); reject(new Error("Image set is too large")); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) { response.destroy(new Error("Image set is too large")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => req.destroy(new Error("File download timed out")), 15_000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}

export async function collectDotFileImages(files: DotFileReference[], rules: DotFileRule[],
  download: typeof downloadDotFile = downloadDotFile) {
  const urls = files.map((file) => approvedDotFileUrl(file.download_url, rules));
  if (urls.some((url) => !url)) throw new Error("File reference is outside the approved host contract");
  const images: { base64: string }[] = []; let total = 0;
  for (let index = 0; index < files.length; index++) {
    const bytes = await download(urls[index]!, MAX_DOT_FILE_BYTES - total);
    total += bytes.length;
    const image = sniffImage(bytes);
    if (!image || total > MAX_DOT_FILE_BYTES || (files[index].mime_type && files[index].mime_type !== image.mime)) {
      throw new Error("Supply a small PNG, JPEG or WebP image set");
    }
    images.push({ base64: Buffer.from(bytes).toString("base64") });
  }
  return images;
}
