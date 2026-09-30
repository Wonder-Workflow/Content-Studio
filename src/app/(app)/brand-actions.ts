"use server";

import { refresh, revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { readBrandFields } from "@/lib/brand";
import { postBrandBotWebhook, readBrandBotEnv } from "@/lib/brand-bot";
import {
  BRAND_JOB_COLUMNS,
  BRAND_JOB_ERROR_MAX,
  BRAND_PULL_ALREADY_DONE,
  BRAND_PULL_IN_PROGRESS,
  BRAND_PULL_QUEUED,
  brandBotPayload,
  brandJobFromRow,
  brandJobsQueryError,
  decideBrandPull,
  readBrandPullFields,
  type BrandJob,
  type BrandJobSnapshot,
} from "@/lib/brand-job";
import { getBrandJobSnapshot, getCurrentAgency } from "@/lib/data";
import { POST_ID_RE } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

export type BrandFormState = {
  error: string | null;
  message?: string | null;
};

type ClientRef = { id: string; slug: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

type ClientAccess =
  | { ok: false; error: string }
  | {
      ok: true;
      client: ClientRef;
      agencyId: string;
      userId: string;
      supabase: Supabase;
    };

function dbError(error: { code?: string; message: string }) {
  if (error.code === "23514") {
    return "One of the brand fields is too long, or a color is not a hex value like #1B3A4B.";
  }
  if (error.code === "42501") {
    return "You cannot edit this client's brand.";
  }
  return error.message;
}

async function requireClient(clientId: string): Promise<ClientAccess> {
  if (!POST_ID_RE.test(clientId)) {
    return { ok: false, error: "That client is not on this studio." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in before editing the brand." };

  const agency = await getCurrentAgency();
  if (!agency) return { ok: false, error: "Create a studio before editing the brand." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug")
    .eq("id", clientId)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That client is not on this studio." };

  return { ok: true, client: data, agencyId: agency.id, userId: user.id, supabase };
}

export async function saveBrand(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };

  const parsed = readBrandFields(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { data, error } = await access.supabase
    .from("clients")
    .update({ brand: parsed.brand })
    .eq("id", access.client.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: dbError(error) };
  if (!data) return { error: "That client is not on this studio." };

  revalidatePath(`/clients/${access.client.slug}/brand`);
  return { error: null, message: "Brand saved." };
}

export type BrandPullState = {
  error: string | null;
  message: string | null;
  job: BrandJob | null;
};

function clipError(message: string) {
  if (message.length <= BRAND_JOB_ERROR_MAX) return message;
  return message.slice(0, BRAND_JOB_ERROR_MAX);
}

async function loadSnapshot(clientId: string): Promise<
  { ok: true; snapshot: BrandJobSnapshot } | { ok: false; error: string }
> {
  try {
    return { ok: true, snapshot: await getBrandJobSnapshot(clientId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brand pull is unavailable.";
    return { ok: false, error: message };
  }
}

export async function getLatestBrandJob(clientId: string): Promise<
  { ok: true; snapshot: BrandJobSnapshot } | { ok: false; error: string }
> {
  const access = await requireClient(clientId);
  if (!access.ok) return { ok: false, error: access.error };
  return loadSnapshot(access.client.id);
}

export async function refreshBrand(clientId: string): Promise<{ error: string | null }> {
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };
  revalidatePath(`/clients/${access.client.slug}/brand`);
  refresh();
  return { error: null };
}

export async function createBrandJob(
  _prev: BrandPullState,
  formData: FormData,
): Promise<BrandPullState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error, message: null, job: null };

  const parsed = readBrandPullFields(formData);
  if (!parsed.ok) return { error: parsed.error, message: null, job: null };

  const bot = readBrandBotEnv();
  if (!bot.ok) return { error: bot.error, message: null, job: null };

  const loaded = await loadSnapshot(access.client.id);
  if (!loaded.ok) return { error: loaded.error, message: null, job: null };

  const decision = decideBrandPull({
    regenerate: parsed.fields.regenerate,
    hasCompleted: loaded.snapshot.hasCompleted,
    openJobId: loaded.snapshot.open?.id ?? null,
  });

  if (decision.type === "reject_completed") {
    return { error: BRAND_PULL_ALREADY_DONE, message: null, job: loaded.snapshot.latest };
  }

  if (decision.type === "return_open" && loaded.snapshot.open) {
    return { error: null, message: BRAND_PULL_IN_PROGRESS, job: loaded.snapshot.open };
  }

  if (decision.type === "replace_open") {
    const { error } = await access.supabase
      .from("brand_jobs")
      .update({ status: "failed", error: "Replaced by a newer pull." })
      .eq("id", decision.jobId)
      .in("status", ["queued", "processing"]);
    if (error) return { error: brandJobsQueryError(error), message: null, job: null };
  }

  const { data, error } = await access.supabase
    .from("brand_jobs")
    .insert({
      client_id: access.client.id,
      agency_id: access.agencyId,
      created_by: access.userId,
      website_url: parsed.fields.websiteUrl,
      social_urls: parsed.fields.socialUrls,
      notes: parsed.fields.notes,
      regenerate: parsed.fields.regenerate,
      status: "queued",
    })
    .select(BRAND_JOB_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const again = await loadSnapshot(access.client.id);
      const open = again.ok ? again.snapshot.open : null;
      return { error: null, message: BRAND_PULL_IN_PROGRESS, job: open };
    }
    if (error.code === "42501") {
      return { error: "You cannot pull a brand for this client.", message: null, job: null };
    }
    return { error: brandJobsQueryError(error), message: null, job: null };
  }

  const job = brandJobFromRow(data);
  if (!job) return { error: "The brand pull was saved, but the row could not be read back.", message: null, job: null };

  const posted = await postBrandBotWebhook(
    brandBotPayload({
      jobId: job.id,
      clientId: access.client.id,
      websiteUrl: parsed.fields.websiteUrl,
      socialUrls: parsed.fields.socialUrls,
      regenerate: parsed.fields.regenerate,
      notes: parsed.fields.notes,
    }),
    bot.env,
  );

  if (!posted.ok) {
    const failure = clipError(posted.error);
    await access.supabase
      .from("brand_jobs")
      .update({ status: "failed", error: failure })
      .eq("id", job.id);
    revalidatePath(`/clients/${access.client.slug}/brand`);
    return {
      error: failure,
      message: null,
      job: { ...job, status: "failed", error: failure },
    };
  }

  revalidatePath(`/clients/${access.client.slug}/brand`);
  return { error: null, message: BRAND_PULL_QUEUED, job };
}
