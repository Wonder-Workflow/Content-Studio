/**
 * Wakes an external Grok Bot routine. Server-only: do not import this from
 * client components. The sender key is BRAND_BOT_WEBHOOK_SECRET.
 *
 * Grok Bot routines expect the key as a bearer token:
 *   Authorization: Bearer <BRAND_BOT_WEBHOOK_SECRET>
 * Paste the key itself into the env var. A leading "Bearer " is stripped.
 * A 2xx response means the bot accepted the call and started a run. It does
 * not mean the brand notes are written yet.
 */

import { BRAND_PULL_NOT_CONFIGURED, type BrandBotPayload } from "@/lib/brand-job";

export type BrandBotEnv = { url: string; secret: string };

export function brandBotAuthorization(secret: string): string {
  const trimmed = secret.trim();
  const key = /^bearer\s+/i.test(trimmed) ? trimmed.replace(/^bearer\s+/i, "").trim() : trimmed;
  return `Bearer ${key}`;
}

export function readBrandBotEnv(
  env: Record<string, string | undefined> = process.env,
): { ok: true; env: BrandBotEnv } | { ok: false; error: string } {
  const url = env.BRAND_BOT_WEBHOOK_URL?.trim() ?? "";
  const secret = env.BRAND_BOT_WEBHOOK_SECRET?.trim() ?? "";
  if (!url || !secret) return { ok: false, error: BRAND_PULL_NOT_CONFIGURED };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "BRAND_BOT_WEBHOOK_URL is not a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "BRAND_BOT_WEBHOOK_URL must start with https:// or http://." };
  }
  return { ok: true, env: { url, secret } };
}

export async function postBrandBotWebhook(
  payload: BrandBotPayload,
  env: BrandBotEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl(env.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: brandBotAuthorization(env.secret),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `The brand bot did not accept the pull (${response.status}). Ask an admin to check the webhook URL and sender key.`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The brand bot could not be reached. Try again in a moment.",
    };
  }
}
