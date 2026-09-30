"use server";

import { refresh, revalidatePath } from "next/cache";
import { postDotSlackBrief, readDotSlackEnv } from "@/lib/art-bot";
import { DOT_SLACK_PRODUCTION_CHANNEL_ID } from "@/lib/art-channel";
import {
  ART_IN_PROGRESS,
  ART_JOB_COLUMNS,
  ART_SLOTS_FULL,
  artJobsQueryError,
  artJobFromRow,
  artTarget,
  buildArtBrief,
  describeArtSlots,
  dotSlackText,
  queuedArtMessage,
  readArtRequest,
  slotsAreFull,
  type ArtJob,
  type ArtJobSnapshot,
} from "@/lib/art-job";
import { getCurrentUser } from "@/lib/auth";
import { brandFromRow } from "@/lib/brand";
import { getArtJobSnapshot, getCurrentAgency } from "@/lib/data";
import { packFromRow } from "@/lib/pack";
import { POST_ID_RE, isPostFormat } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

export type ArtJobState = {
  error: string | null;
  message: string | null;
  job: ArtJob | null;
};

type ClientRef = { id: string; slug: string; name: string; brand: ReturnType<typeof brandFromRow> };
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

async function requireClient(clientId: string): Promise<ClientAccess> {
  if (!POST_ID_RE.test(clientId)) {
    return { ok: false, error: "That client is not on this studio." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in before generating images." };

  const agency = await getCurrentAgency();
  if (!agency) return { ok: false, error: "Create a studio before generating images." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug, name, brand")
    .eq("id", clientId)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That client is not on this studio." };

  return {
    ok: true,
    client: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      brand: brandFromRow(data.brand),
    },
    agencyId: agency.id,
    userId: user.id,
    supabase,
  };
}

async function loadSnapshot(
  postId: string,
): Promise<{ ok: true; snapshot: ArtJobSnapshot } | { ok: false; error: string }> {
  try {
    return { ok: true, snapshot: await getArtJobSnapshot(postId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation is unavailable.";
    return { ok: false, error: message };
  }
}

export async function getLatestArtJob(
  clientId: string,
  postId: string,
): Promise<{ ok: true; snapshot: ArtJobSnapshot } | { ok: false; error: string }> {
  const access = await requireClient(clientId);
  if (!access.ok) return { ok: false, error: access.error };
  if (!POST_ID_RE.test(postId)) return { ok: false, error: "That post is not on this calendar." };

  const { data, error } = await access.supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("client_id", access.client.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That post is not on this calendar." };

  return loadSnapshot(postId);
}

export async function refreshArt(clientId: string, postId: string): Promise<{ error: string | null }> {
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };
  if (!POST_ID_RE.test(postId)) return { error: "That post is not on this calendar." };
  revalidatePath(`/clients/${access.client.slug}/packs/${postId}`);
  refresh();
  return { error: null };
}

export async function createArtJob(
  _prev: ArtJobState,
  formData: FormData,
): Promise<ArtJobState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error, message: null, job: null };

  const postId = String(formData.get("postId") ?? "");
  if (!POST_ID_RE.test(postId)) {
    return { error: "That post is not on this calendar.", message: null, job: null };
  }

  const parsed = readArtRequest(formData);
  if (!parsed.ok) return { error: parsed.error, message: null, job: null };

  const { data: post, error: postError } = await access.supabase
    .from("posts")
    .select("id, title, hook, format, platform, pack")
    .eq("id", postId)
    .eq("client_id", access.client.id)
    .maybeSingle();
  if (postError) return { error: postError.message, message: null, job: null };
  if (!post || !isPostFormat(post.format)) {
    return { error: "That post is not on this calendar.", message: null, job: null };
  }

  const target = artTarget(post.format);
  const { data: media, error: mediaError } = await access.supabase
    .from("post_media")
    .select("kind, position")
    .eq("post_id", postId)
    .eq("client_id", access.client.id)
    .eq("kind", target.kind);
  if (mediaError) return { error: mediaError.message, message: null, job: null };

  const positions = (media ?? []).map((row) => row.position);
  const full = slotsAreFull(positions, target.count);
  if (full && !parsed.replace) {
    const loaded = await loadSnapshot(postId);
    return {
      error: ART_SLOTS_FULL,
      message: null,
      job: loaded.ok ? loaded.snapshot.latest : null,
    };
  }
  const replace = full && parsed.replace;

  const loaded = await loadSnapshot(postId);
  if (!loaded.ok) return { error: loaded.error, message: null, job: null };
  if (loaded.snapshot.open) {
    return { error: null, message: ART_IN_PROGRESS, job: loaded.snapshot.open };
  }

  const { data, error } = await access.supabase
    .from("art_jobs")
    .insert({
      client_id: access.client.id,
      post_id: postId,
      agency_id: access.agencyId,
      created_by: access.userId,
      brief: parsed.notes,
      replace_media: replace,
      status: "queued",
    })
    .select(ART_JOB_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const again = await loadSnapshot(postId);
      return {
        error: null,
        message: ART_IN_PROGRESS,
        job: again.ok ? again.snapshot.open : null,
      };
    }
    if (error.code === "42501") {
      return { error: "You cannot generate images for this client.", message: null, job: null };
    }
    return { error: artJobsQueryError(error), message: null, job: null };
  }

  const job = artJobFromRow(data);
  if (!job) {
    return { error: "The art job was saved, but the row could not be read back.", message: null, job: null };
  }

  const slots = describeArtSlots({ format: post.format, positions, replace });
  const brief = buildArtBrief({
    clientName: access.client.name,
    clientSlug: access.client.slug,
    postId,
    brand: access.client.brand,
    post: {
      title: post.title,
      hook: post.hook,
      format: post.format,
      platform: post.platform,
      pack: packFromRow(post.pack),
    },
    notes: parsed.notes,
    slots,
  });

  const slack = readDotSlackEnv();
  let message = queuedArtMessage({ slack: "skipped" });
  if (slack.ok) {
    const posted = await postDotSlackBrief({
      token: slack.env.token,
      channelId: slack.env.channelId,
      text: dotSlackText({
        jobId: job.id,
        postId,
        clientSlug: access.client.slug,
        format: post.format,
        brief,
      }),
    });
    if (posted.ok) {
      message =
        slack.env.channelId === DOT_SLACK_PRODUCTION_CHANNEL_ID
          ? queuedArtMessage({ slack: "content" })
          : queuedArtMessage({ slack: "other" });
    } else {
      message = queuedArtMessage({ slack: "failed", detail: posted.error });
    }
  } else if (slack.reason === "invalid_channel") {
    message = queuedArtMessage({ slack: "failed", detail: "the Slack channel id is not valid" });
  }

  revalidatePath(`/clients/${access.client.slug}/packs/${postId}`);
  return { error: null, message, job };
}
