/**
 * Bearer check for DOT callbacks. Server-only.
 * The secret is DOT_ART_CALLBACK_SECRET. Do not prefix it with NEXT_PUBLIC_.
 */

import { timingSafeEqual } from "node:crypto";

export function readArtCallbackSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.DOT_ART_CALLBACK_SECRET?.trim() ?? "";
  return secret || null;
}

export function artCallbackAuthorized(authorization: string | null, secret: string): boolean {
  if (!secret || secret.length > 500) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  const presented = match?.[1] ?? "";
  if (!presented || presented.length > 500) return false;
  const got = Buffer.from(presented);
  const expected = Buffer.from(secret);
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}
