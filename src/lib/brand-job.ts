/**
 * A brand pull is one row in brand_jobs plus a webhook that wakes the Grok Bot.
 * This module is safe to import from client components: it does not read secrets.
 */

export const BRAND_JOB_STATUSES = ["queued", "processing", "done", "failed"] as const;

export type BrandJobStatus = (typeof BRAND_JOB_STATUSES)[number];

export const BRAND_WEBSITE_MAX = 2000;
export const BRAND_SOCIAL_MAX = 20;
export const BRAND_SOCIAL_URL_MAX = 2000;
export const BRAND_JOB_NOTES_MAX = 2000;
export const BRAND_JOB_ERROR_MAX = 2000;

export const BRAND_JOB_COLUMNS =
  "id, client_id, status, error, website_url, social_urls, notes, regenerate, created_at, updated_at, completed_at";

export const BRAND_PULL_ALREADY_DONE =
  "This client already has a completed brand pull. Use Regenerate to research the links again.";

export const BRAND_PULL_IN_PROGRESS = "A brand pull is already running for this client.";

export const BRAND_PULL_QUEUED =
  "Queued. The brand bot will read those links and fill the notes below.";

export const BRAND_PULL_NOT_CONFIGURED =
  "Brand pull is not set up yet. An admin needs to set BRAND_BOT_WEBHOOK_URL and BRAND_BOT_WEBHOOK_SECRET.";

export const BRAND_JOBS_UNAVAILABLE =
  "Brand pull is not available yet. Apply the latest database migration.";

export type BrandJob = {
  id: string;
  clientId: string;
  status: BrandJobStatus;
  error: string | null;
  websiteUrl: string;
  socialUrls: string[];
  notes: string | null;
  regenerate: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type BrandJobSnapshot = {
  latest: BrandJob | null;
  open: BrandJob | null;
  hasCompleted: boolean;
};

export type BrandBotPayload = {
  job_id: string;
  client_id: string;
  website_url: string;
  social_urls: string[];
  regenerate: boolean;
  notes?: string;
};

export type BrandPullFields = {
  websiteUrl: string;
  socialUrls: string[];
  notes: string | null;
  regenerate: boolean;
};

export type BrandPullDecision =
  | { type: "reject_completed" }
  | { type: "return_open"; jobId: string }
  | { type: "replace_open"; jobId: string }
  | { type: "insert" };

export function isBrandJobStatus(value: string): value is BrandJobStatus {
  return (BRAND_JOB_STATUSES as readonly string[]).includes(value);
}

export function brandJobStatusDetail(status: BrandJobStatus): string {
  switch (status) {
    case "queued":
      return BRAND_PULL_QUEUED;
    case "processing":
      return "Pulling brand from those links…";
    case "done":
      return "Done. Refresh brand if the notes below still look old, then edit and save.";
    case "failed":
      return "The pull failed.";
  }
}

export function decideBrandPull(input: {
  regenerate: boolean;
  hasCompleted: boolean;
  openJobId: string | null;
}): BrandPullDecision {
  if (input.openJobId && !input.regenerate) {
    return { type: "return_open", jobId: input.openJobId };
  }
  if (input.openJobId && input.regenerate) {
    return { type: "replace_open", jobId: input.openJobId };
  }
  if (input.hasCompleted && !input.regenerate) {
    return { type: "reject_completed" };
  }
  return { type: "insert" };
}

export function brandBotPayload(input: {
  jobId: string;
  clientId: string;
  websiteUrl: string;
  socialUrls: string[];
  regenerate: boolean;
  notes: string | null;
}): BrandBotPayload {
  const payload: BrandBotPayload = {
    job_id: input.jobId,
    client_id: input.clientId,
    website_url: input.websiteUrl,
    social_urls: input.socialUrls,
    regenerate: input.regenerate,
  };
  if (input.notes) payload.notes = input.notes;
  return payload;
}

/** http(s) only. A bare host such as harbor.example becomes https://harbor.example/. */
export function normalizePublicUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > BRAND_SOCIAL_URL_MAX || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (withScheme.length > BRAND_WEBSITE_MAX) return null;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  url.hash = "";
  const serialized = url.toString();
  if (serialized.length > BRAND_WEBSITE_MAX) return null;
  return serialized;
}

export function parseSocialUrls(
  raw: string,
): { ok: true; urls: string[] } | { ok: false; error: string } {
  const lines = raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const url = normalizePublicUrl(line);
    if (!url) {
      const shown = line.length > 80 ? `${line.slice(0, 80)}…` : line;
      return { ok: false, error: `“${shown}” is not a website or social link.` };
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  if (urls.length > BRAND_SOCIAL_MAX) {
    return { ok: false, error: `Add at most ${BRAND_SOCIAL_MAX} social links.` };
  }
  return { ok: true, urls };
}

export function readBrandPullFields(
  formData: FormData,
): { ok: true; fields: BrandPullFields } | { ok: false; error: string } {
  const websiteUrl = normalizePublicUrl(String(formData.get("websiteUrl") ?? ""));
  if (!websiteUrl) {
    return { ok: false, error: "Enter a website URL, like https://harbor.example." };
  }

  const social = parseSocialUrls(String(formData.get("socialUrls") ?? ""));
  if (!social.ok) return social;

  const notes = String(formData.get("notes") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (notes.length > BRAND_JOB_NOTES_MAX) {
    return { ok: false, error: `Notes must be ${BRAND_JOB_NOTES_MAX} characters or fewer.` };
  }

  const intent = String(formData.get("intent") ?? "");
  const regenerate =
    intent === "regenerate" || String(formData.get("regenerate") ?? "") === "true";

  return {
    ok: true,
    fields: {
      websiteUrl,
      socialUrls: social.urls,
      notes: notes || null,
      regenerate,
    },
  };
}

export function brandJobsQueryError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205") return BRAND_JOBS_UNAVAILABLE;
  return error.message;
}

export function brandJobFromRow(value: unknown): BrandJob | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const clientId = typeof row.client_id === "string" ? row.client_id : "";
  const status = typeof row.status === "string" ? row.status : "";
  if (!id || !clientId || !isBrandJobStatus(status)) return null;

  const socialUrls = Array.isArray(row.social_urls)
    ? row.social_urls.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id,
    clientId,
    status,
    error: typeof row.error === "string" && row.error ? row.error : null,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : "",
    socialUrls,
    notes: typeof row.notes === "string" && row.notes ? row.notes : null,
    regenerate: row.regenerate === true,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}
