"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { postDotSlackBrief, readDotSlackEnv } from "@/lib/art-bot";
import { DOT_SLACK_PRODUCTION_CHANNEL_ID } from "@/lib/art-channel";
import {
  ART_IN_PROGRESS,
  artTarget,
  buildArtBrief,
  describeArtSlots,
  dotSlackText,
} from "@/lib/art-job";
import { getCurrentUser } from "@/lib/auth";
import {
  BATCH_REFERENCE_BUCKET,
  applyRevision,
  batchBriefNotes,
  batchQueryError,
  draftsForPlan,
  planBatch,
  readBatchWindow,
  readMix,
  readReferenceFiles,
  readReferenceUrls,
  readRevisionNote,
  readStyleNote,
  referenceObjectPath,
  referenceUrlsFromRow,
} from "@/lib/batch";
import { brandFromRow, type BrandProfile } from "@/lib/brand";
import { getCurrentAgency } from "@/lib/data";
import { SIGNED_URL_SECONDS, inspectImageFile } from "@/lib/media";
import { packFromRow } from "@/lib/pack";
import { POST_ID_RE, isPostFormat, type PostFormat } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

export type BatchFormState = { error: string | null };

export type ReviseState = { error: string | null; message: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;

type ClientRef = { id: string; slug: string; name: string; brand: BrandProfile };

type ClientAccess =
  | { ok: false; error: string }
  | { ok: true; client: ClientRef; agencyId: string; userId: string; supabase: Supabase };

function dbError(error: { code?: string; message: string }) {
  const unavailable = batchQueryError(error);
  if (unavailable !== error.message) return unavailable;
  if (error.code === "23514") {
    return "Check the mix, dates, and style note, then try again.";
  }
  if (error.code === "42501") return "You cannot generate a batch for this client.";
  return error.message;
}

async function requireClient(clientId: string): Promise<ClientAccess> {
  if (!POST_ID_RE.test(clientId)) {
    return { ok: false, error: "That client is not on this studio." };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in before generating a batch." };
  const agency = await getCurrentAgency();
  if (!agency) return { ok: false, error: "Create a studio before generating a batch." };

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
    client: { id: data.id, slug: data.slug, name: data.name, brand: brandFromRow(data.brand) },
    agencyId: agency.id,
    userId: user.id,
    supabase,
  };
}

async function signedReferencePaths(supabase: Supabase, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(BATCH_REFERENCE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return [];
  return data.flatMap((item) => (item.signedUrl ? [item.signedUrl] : []));
}

type SlackWake = "content" | "other" | "skipped" | "failed";

async function wakeDot(input: {
  jobId: string;
  postId: string;
  clientSlug: string;
  format: string;
  brief: string;
}): Promise<SlackWake> {
  const slack = readDotSlackEnv();
  if (!slack.ok) return slack.reason === "invalid_channel" ? "failed" : "skipped";
  const posted = await postDotSlackBrief({
    token: slack.env.token,
    channelId: slack.env.channelId,
    text: dotSlackText({
      jobId: input.jobId,
      postId: input.postId,
      clientSlug: input.clientSlug,
      format: input.format,
      brief: input.brief,
    }),
  });
  if (!posted.ok) return "failed";
  return slack.env.channelId === DOT_SLACK_PRODUCTION_CHANNEL_ID ? "content" : "other";
}

function slackSentence(wakes: SlackWake[], count: number): string {
  const noun = count === 1 ? "image job" : "image jobs";
  if (wakes.length === 0 || wakes.every((wake) => wake === "skipped")) {
    return `${count} ${noun} queued. DOT can pull them from the plugin. Slack is not connected on this server yet.`;
  }
  if (wakes.some((wake) => wake === "failed")) {
    return `${count} ${noun} queued. Slack did not get every message. DOT can still pull them from the plugin.`;
  }
  if (wakes.every((wake) => wake === "content")) {
    return `${count} ${noun} queued. DOT was asked in #content.`;
  }
  return `${count} ${noun} queued. DOT was asked in Slack.`;
}

async function removeUploaded(supabase: Supabase, paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from(BATCH_REFERENCE_BUCKET).remove(paths);
}

async function rollbackBatch(supabase: Supabase, batchId: string, paths: string[]) {
  await supabase.from("posts").delete().eq("batch_id", batchId);
  await supabase.from("batch_jobs").delete().eq("id", batchId);
  await removeUploaded(supabase, paths);
}

export async function createBatch(
  _prev: BatchFormState,
  formData: FormData,
): Promise<BatchFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };

  const window = readBatchWindow({
    preset: String(formData.get("window") ?? ""),
    today: String(formData.get("today") ?? ""),
    customStart: String(formData.get("startsOn") ?? ""),
    customEnd: String(formData.get("endsOn") ?? ""),
  });
  if (!window.ok) return { error: window.error };

  const mix = readMix({
    carousel: String(formData.get("carouselCount") ?? ""),
    staticCount: String(formData.get("staticCount") ?? ""),
    reel: String(formData.get("reelCount") ?? ""),
  });
  if (!mix.ok) return { error: mix.error };

  const style = readStyleNote(String(formData.get("styleNote") ?? ""));
  if (!style.ok) return { error: style.error };

  const urls = readReferenceUrls(String(formData.get("referenceUrls") ?? ""));
  if (!urls.ok) return { error: urls.error };

  const files = readReferenceFiles(formData.getAll("references"));
  if (!files.ok) return { error: files.error };

  const planned = planBatch(window.start, window.end, mix.mix);
  if (!planned.ok) return { error: planned.error };

  const drafts = draftsForPlan({
    brand: access.client.brand,
    slots: planned.slots,
    styleNote: style.note,
    referenceUrls: urls.urls,
  });

  const { data: batch, error: batchError } = await access.supabase
    .from("batch_jobs")
    .insert({
      client_id: access.client.id,
      agency_id: access.agencyId,
      created_by: access.userId,
      starts_on: window.start,
      ends_on: window.end,
      mix: mix.mix,
      style_note: style.note,
      reference_urls: urls.urls,
      status: "ready",
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return { error: batchError ? dbError(batchError) : "The batch could not be saved." };
  }

  const uploaded: string[] = [];
  for (const file of files.files) {
    const inspectedFile = inspectImageFile({ type: file.type, size: file.size });
    if (!inspectedFile.ok) {
      await rollbackBatch(access.supabase, batch.id, uploaded);
      return { error: inspectedFile.error };
    }
    const mediaId = randomUUID();
    let path: string;
    try {
      path = referenceObjectPath({
        agencyId: access.agencyId,
        clientId: access.client.id,
        batchId: batch.id,
        mediaId,
        extension: inspectedFile.extension,
      });
    } catch {
      await rollbackBatch(access.supabase, batch.id, uploaded);
      return { error: "That reference image could not be saved." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await access.supabase.storage.from(BATCH_REFERENCE_BUCKET).upload(path, bytes, {
      contentType: inspectedFile.mime,
      upsert: false,
    });
    if (stored.error) {
      await rollbackBatch(access.supabase, batch.id, uploaded);
      return { error: "That reference image could not be saved." };
    }
    uploaded.push(path);
    const { error: refError } = await access.supabase.from("batch_references").insert({
      id: mediaId,
      batch_id: batch.id,
      client_id: access.client.id,
      storage_path: path,
      mime_type: inspectedFile.mime,
      byte_size: file.size,
    });
    if (refError) {
      await rollbackBatch(access.supabase, batch.id, uploaded);
      return { error: dbError(refError) };
    }
  }

  const { data: posts, error: postError } = await access.supabase
    .from("posts")
    .insert(
      drafts.map((draft) => ({
        client_id: access.client.id,
        batch_id: batch.id,
        title: draft.title,
        hook: draft.hook,
        status: "idea",
        format: draft.format,
        platform: draft.platform,
        starts_on: draft.startsOn,
        ends_on: null,
        pack: draft.pack,
      })),
    )
    .select("id, title, hook, format, platform, pack");

  if (postError || !posts || posts.length !== drafts.length) {
    await rollbackBatch(access.supabase, batch.id, uploaded);
    return { error: postError ? dbError(postError) : "The draft posts could not be saved." };
  }

  const { data: jobs, error: jobError } = await access.supabase
    .from("art_jobs")
    .insert(
      posts.map((post) => ({
        client_id: access.client.id,
        post_id: post.id,
        agency_id: access.agencyId,
        created_by: access.userId,
        batch_id: batch.id,
        brief: null,
        replace_media: false,
        hold_media: false,
        status: "queued",
      })),
    )
    .select("id, post_id");

  if (jobError || !jobs) {
    await rollbackBatch(access.supabase, batch.id, uploaded);
    return { error: jobError ? dbError(jobError) : "The image jobs could not be queued." };
  }

  const imageUrls = await signedReferencePaths(access.supabase, uploaded);
  const notes = batchBriefNotes({
    styleNote: style.note,
    referenceUrls: urls.urls,
    referenceImageUrls: imageUrls,
  });
  const postsById = new Map(posts.map((post) => [post.id, post]));
  await Promise.all(
    jobs.map(async (job) => {
      const post = postsById.get(job.post_id);
      if (!post || !isPostFormat(post.format)) return;
      const slots = describeArtSlots({ format: post.format, positions: [], replace: false });
      const brief = buildArtBrief({
        clientName: access.client.name,
        clientSlug: access.client.slug,
        postId: post.id,
        brand: access.client.brand,
        post: {
          title: post.title,
          hook: post.hook,
          format: post.format,
          platform: post.platform,
          pack: packFromRow(post.pack),
        },
        notes,
        slots,
      });
      await wakeDot({
        jobId: job.id,
        postId: post.id,
        clientSlug: access.client.slug,
        format: post.format,
        brief,
      });
    }),
  );

  revalidatePath(`/clients/${access.client.slug}`);
  revalidatePath(`/clients/${access.client.slug}/packs`);
  revalidatePath(`/clients/${access.client.slug}/batch/${batch.id}`);
  redirect(`/clients/${access.client.slug}/batch/${batch.id}`);
}

export async function reviseBatch(
  _prev: ReviseState,
  formData: FormData,
): Promise<ReviseState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error, message: null };

  const batchId = String(formData.get("batchId") ?? "");
  if (!POST_ID_RE.test(batchId)) {
    return { error: "That batch is not on this client.", message: null };
  }
  const postIdRaw = String(formData.get("postId") ?? "").trim();
  const postId = postIdRaw && POST_ID_RE.test(postIdRaw) ? postIdRaw : null;
  if (postIdRaw && !postId) return { error: "That post is not in this batch.", message: null };

  const note = readRevisionNote(String(formData.get("note") ?? ""));
  if (!note.ok) return { error: note.error, message: null };

  const { data: batch, error: batchError } = await access.supabase
    .from("batch_jobs")
    .select("id, style_note, reference_urls")
    .eq("id", batchId)
    .eq("client_id", access.client.id)
    .maybeSingle();
  if (batchError) return { error: dbError(batchError), message: null };
  if (!batch) return { error: "That batch is not on this client.", message: null };

  let postQuery = access.supabase
    .from("posts")
    .select("id, title, hook, format, platform, pack")
    .eq("client_id", access.client.id)
    .eq("batch_id", batchId);
  if (postId) postQuery = postQuery.eq("id", postId);
  const { data: posts, error: postError } = await postQuery;
  if (postError) return { error: postError.message, message: null };
  if (!posts || posts.length === 0) {
    return { error: "That batch has no packs to revise.", message: null };
  }

  const revised = posts.flatMap((post) => {
    if (!isPostFormat(post.format)) return [];
    const next = applyRevision(
      { title: post.title, hook: post.hook, pack: packFromRow(post.pack) },
      note.note,
    );
    return [{ post, next }];
  });
  if (revised.length === 0) return { error: "That batch has no packs to revise.", message: null };

  for (const item of revised) {
    const { error } = await access.supabase
      .from("posts")
      .update({
        title: item.next.title,
        hook: item.next.hook,
        pack: item.next.pack,
      })
      .eq("id", item.post.id)
      .eq("client_id", access.client.id)
      .eq("batch_id", batchId);
    if (error) return { error: dbError(error), message: null };
  }

  const { error: revisionError } = await access.supabase.from("batch_revisions").insert({
    batch_id: batchId,
    client_id: access.client.id,
    post_id: postId,
    note: note.note,
    created_by: access.userId,
  });
  if (revisionError) return { error: dbError(revisionError), message: null };

  const wantsArt = revised.some((item) => item.next.queueArt);
  const wakes: Promise<SlackWake>[] = [];
  let held = 0;
  let skippedOpen = 0;

  if (wantsArt) {
    const ids = revised.map((item) => item.post.id);
    const [{ data: media }, { data: openJobs }, { data: refs }] = await Promise.all([
      access.supabase.from("post_media").select("post_id, kind").in("post_id", ids),
      access.supabase
        .from("art_jobs")
        .select("post_id")
        .in("post_id", ids)
        .in("status", ["queued", "processing"]),
      access.supabase.from("batch_references").select("storage_path").eq("batch_id", batchId),
    ]);
    const open = new Set((openJobs ?? []).map((row) => row.post_id));
    const filled = new Set(
      (media ?? []).map((row) => `${row.post_id}:${row.kind}`),
    );
    const imageUrls = await signedReferencePaths(
      access.supabase,
      (refs ?? []).map((row) => row.storage_path),
    );
    const notes = batchBriefNotes({
      styleNote: typeof batch.style_note === "string" ? batch.style_note : "",
      referenceUrls: referenceUrlsFromRow(batch.reference_urls),
      referenceImageUrls: imageUrls,
      revisionNote: note.note,
    });

    for (const item of revised) {
      if (!item.next.queueArt) continue;
      if (open.has(item.post.id)) {
        skippedOpen += 1;
        continue;
      }
      const kind = artTarget(item.post.format).kind;
      const hold = filled.has(`${item.post.id}:${kind}`);
      if (hold) held += 1;
      const { data: job, error: jobError } = await access.supabase
        .from("art_jobs")
        .insert({
          client_id: access.client.id,
          post_id: item.post.id,
          agency_id: access.agencyId,
          created_by: access.userId,
          batch_id: batchId,
          brief: note.note,
          replace_media: false,
          hold_media: hold,
          status: "queued",
        })
        .select("id")
        .single();
      if (jobError) {
        if (jobError.code === "23505") {
          skippedOpen += 1;
          continue;
        }
        return { error: dbError(jobError), message: null };
      }
      if (!job) continue;
      const slots = describeArtSlots({
        format: item.post.format as PostFormat,
        positions: [],
        replace: false,
      });
      const brief = buildArtBrief({
        clientName: access.client.name,
        clientSlug: access.client.slug,
        postId: item.post.id,
        brand: access.client.brand,
        post: {
          title: item.next.title,
          hook: item.next.hook,
          format: item.post.format as PostFormat,
          platform: item.post.platform,
          pack: item.next.pack,
        },
        notes,
        slots,
        hold,
      });
      wakes.push(
        wakeDot({
          jobId: job.id,
          postId: item.post.id,
          clientSlug: access.client.slug,
          format: item.post.format,
          brief,
        }),
      );
    }
  }

  const woke = await Promise.all(wakes);

  revalidatePath(`/clients/${access.client.slug}`);
  revalidatePath(`/clients/${access.client.slug}/packs`);
  revalidatePath(`/clients/${access.client.slug}/batch/${batchId}`);
  for (const item of revised) {
    revalidatePath(`/clients/${access.client.slug}/packs/${item.post.id}`);
  }

  const countLabel = revised.length === 1 ? "this pack" : `${revised.length} packs`;
  const parts = [`Updated ${countLabel}.`];
  if (woke.length > 0) {
    parts.push(slackSentence(woke, woke.length));
    if (held > 0) {
      parts.push("New images stay beside the current ones until you accept them on the pack.");
    }
  } else if (!wantsArt) {
    parts.push("No new images were queued.");
  }
  if (skippedOpen > 0) {
    parts.push(
      skippedOpen === 1
        ? ART_IN_PROGRESS
        : `${skippedOpen} packs already have an image job running, so those images were not queued again.`,
    );
  }

  return { error: null, message: parts.join(" ") };
}

async function pendingAccess(clientId: string, postId: string, jobId: string) {
  const access = await requireClient(clientId);
  if (!access.ok) return access;
  if (!POST_ID_RE.test(postId) || !POST_ID_RE.test(jobId)) {
    return { ok: false as const, error: "That image is not on this pack." };
  }
  const { data, error } = await access.supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("client_id", access.client.id)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "That post is not on this calendar." };
  return access;
}

export async function acceptPendingArt(
  clientId: string,
  postId: string,
  jobId: string,
): Promise<{ error: string | null }> {
  const access = await pendingAccess(clientId, postId, jobId);
  if (!access.ok) return { error: access.error };
  const { error } = await access.supabase.rpc("accept_pending_art", { target_job_id: jobId });
  if (error) {
    return { error: error.message || "Those images could not be used." };
  }
  revalidatePath(`/clients/${access.client.slug}/packs/${postId}`);
  return { error: null };
}

export async function discardPendingArt(
  clientId: string,
  postId: string,
  jobId: string,
): Promise<{ error: string | null }> {
  const access = await pendingAccess(clientId, postId, jobId);
  if (!access.ok) return { error: access.error };
  const { error } = await access.supabase.rpc("discard_pending_art", { target_job_id: jobId });
  if (error) {
    return { error: error.message || "Those images could not be discarded." };
  }
  revalidatePath(`/clients/${access.client.slug}/packs/${postId}`);
  return { error: null };
}
