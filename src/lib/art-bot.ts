/**
 * Wakes DOT in Slack. Server-only: do not import this from client components.
 * The bot token is DOT_SLACK_BOT_TOKEN. The production channel is #content.
 *
 * A 2xx response with ok:true means Slack accepted the message. It does not
 * mean the images are on the pack yet.
 */

import { DOT_SLACK_PRODUCTION_CHANNEL_ID } from "@/lib/art-channel";

export type DotSlackEnv = { token: string; channelId: string };

export type DotSlackRead =
  | { ok: true; env: DotSlackEnv }
  | { ok: false; reason: "missing_token" }
  | { ok: false; reason: "invalid_channel" };

export function readDotSlackEnv(
  env: Record<string, string | undefined> = process.env,
): DotSlackRead {
  const raw = env.DOT_SLACK_BOT_TOKEN?.trim() ?? "";
  const token = /^bearer\s+/i.test(raw) ? raw.replace(/^bearer\s+/i, "").trim() : raw;
  if (!token) return { ok: false, reason: "missing_token" };

  const channel = env.DOT_SLACK_CHANNEL_ID?.trim() || DOT_SLACK_PRODUCTION_CHANNEL_ID;
  if (!/^C[A-Z0-9]{8,}$/.test(channel)) return { ok: false, reason: "invalid_channel" };
  return { ok: true, env: { token, channelId: channel } };
}

function slackError(code: string | undefined): string {
  if (code === "not_in_channel") {
    return "The Slack bot is not in #content. Invite it to that channel.";
  }
  if (code === "channel_not_found") {
    return "Slack could not find that channel. Check DOT_SLACK_CHANNEL_ID.";
  }
  if (code === "invalid_auth" || code === "not_authed" || code === "token_revoked") {
    return "The Slack bot token was rejected. Check DOT_SLACK_BOT_TOKEN.";
  }
  return "Slack did not accept the message.";
}

export async function postDotSlackBrief(
  input: { token: string; channelId: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: input.channelId,
        text: input.text,
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    let payload: { ok?: boolean; error?: string } = {};
    try {
      payload = (await response.json()) as { ok?: boolean; error?: string };
    } catch {
      payload = {};
    }
    if (!response.ok || payload.ok !== true) {
      return { ok: false, error: slackError(payload.error) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Slack could not be reached." };
  }
}
