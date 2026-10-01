import { createHash } from "node:crypto";
import { POST_ID_RE } from "@/lib/posts";

export function readLeaseToken(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const token = (body as Record<string, unknown>).lease_token;
  return typeof token === "string" && POST_ID_RE.test(token) ? token.toLowerCase() : null;
}

/** A stable retry must send the same ordered image descriptors. */
export function artCompletionHash(images: unknown): string {
  return createHash("sha256").update(JSON.stringify(images)).digest("hex");
}

export const ART_CALLBACK_MAX_BODY_BYTES = 4_000_000;

/** Leave headroom below Vercel's 4.5 MB total request ceiling. */
export async function readArtCallbackBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > ART_CALLBACK_MAX_BODY_BYTES) throw new Error("body too large");
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ART_CALLBACK_MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
