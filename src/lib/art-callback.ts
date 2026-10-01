/**
 * DOT / ChatGPT callback handlers. Server-only.
 * Bearer DOT_ART_CALLBACK_SECRET, then the service role writes post_media.
 * This app does not call an image model.
 */

import { randomUUID } from "node:crypto";
import { artCallbackAuthorized, readArtCallbackSecret } from "@/lib/art-auth";
import {
  artJobFromRow,
  buildArtBrief,
  clipArtError,
  describeArtSlots,
  parseFailReason,
  artTarget,
  packPath,
  type ArtJob,
  type ArtSlotPlan,
} from "@/lib/art-job";
import { collectArtFiles, parseCompleteImages } from "@/lib/art-image";
import { artCompletionHash, readArtCallbackBody, readLeaseToken } from "@/lib/art-lease";
import {
  BATCH_REFERENCE_BUCKET,
  batchBriefNotes,
  referenceUrlsFromRow,
} from "@/lib/batch";
import { brandFromRow } from "@/lib/brand";
import { POST_MEDIA_BUCKET, SIGNED_URL_SECONDS, mediaObjectPath, type ImageMime } from "@/lib/media";
import { packFromRow } from "@/lib/pack";
import { POST_ID_RE, isPostFormat } from "@/lib/posts";
import { createServiceClient } from "@/lib/supabase/service";

const JOB_COLUMNS =
  "id, client_id, post_id, agency_id, batch_id, status, error, brief, replace_media, hold_media, created_at, updated_at, completed_at, lease_token, lease_expires_at, attempt_count, expected_kind, expected_positions, completion_hash, completion_result";

type CallbackJob = ArtJob & {
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  expectedKind: string | null;
  expectedPositions: number[] | null;
  completionHash: string | null;
  completionResult: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

async function authorize(
  request: Request,
): Promise<{ ok: true; supabase: ServiceClient } | { ok: false; response: Response }> {
  const secret = readArtCallbackSecret();
  if (!secret) {
    return {
      ok: false,
      response: json(
        { error: "Image callbacks are not set up yet. An admin needs to set DOT_ART_CALLBACK_SECRET." },
        503,
      ),
    };
  }
  if (!artCallbackAuthorized(request.headers.get("authorization"), secret)) {
    return { ok: false, response: json({ error: "That callback secret was not accepted." }, 401) };
  }
  const supabase = createServiceClient();
  if (!supabase) {
    return {
      ok: false,
      response: json(
        {
          error:
            "Image callbacks are not set up yet. An admin needs to set the service role key on the server.",
        },
        503,
      ),
    };
  }
  return { ok: true, supabase };
}

function jobId(id: string): { ok: true; id: string } | { ok: false; response: Response } {
  if (!POST_ID_RE.test(id)) {
    return { ok: false, response: json({ error: "That art job was not found." }, 404) };
  }
  return { ok: true, id };
}

async function loadJob(
  supabase: ServiceClient,
  id: string,
): Promise<{ ok: true; job: CallbackJob } | { ok: false; response: Response }> {
  const { data, error } = await supabase.from("art_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, response: json({ error: "The art job could not be read." }, 500) };
  const job = artJobFromRow(data);
  if (!job || !data) return { ok: false, response: json({ error: "That art job was not found." }, 404) };
  return { ok: true, job: { ...job,
    leaseToken: data.lease_token, leaseExpiresAt: data.lease_expires_at,
    attemptCount: data.attempt_count, expectedKind: data.expected_kind,
    expectedPositions: data.expected_positions, completionHash: data.completion_hash,
    completionResult: data.completion_result,
  } };
}

function jobJson(job: CallbackJob) {
  return {
    id: job.id,
    client_id: job.clientId,
    post_id: job.postId,
    status: job.status,
    notes: job.notes,
    replace: job.replace,
    batch_id: job.batchId,
    hold_media: job.hold,
    error: job.error,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    completed_at: job.completedAt,
    lease_expires_at: job.leaseExpiresAt,
    attempt_count: job.attemptCount,
    expected_kind: job.expectedKind,
    expected_positions: job.expectedPositions,
    completion_result: job.completionResult,
  };
}

function slotsJson(plan: ArtSlotPlan) {
  return {
    format: plan.format,
    kind: plan.kind,
    count: plan.count,
    filled: plan.filled,
    empty: plan.empty,
    replace: plan.replace,
    empty_positions: plan.emptyPositions,
  };
}

async function releaseForRetry(supabase: ServiceClient, jobId: string, token: string, message: string) {
  return supabase.rpc("fail_dot_art_job", {
    target_job_id: jobId, worker_token: token, reason: clipArtError(message), retryable: true,
  });
}

function rpcFailure(error: { code?: string; message: string }) {
  if (error.message.includes("not found")) return json({ error: "That art job was not found." }, 404);
  if (error.code === "P0001" || error.code === "23505") {
    return json({ error: error.code === "23505" ? "That image slot is already filled." : error.message }, 409);
  }
  return json({ error: "The job operation could not be confirmed. Read status and retry with the same token." }, 503);
}

async function callbackBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await readArtCallbackBody(request) };
  } catch (error) {
    return { ok: false, response: json({ error: error instanceof Error && error.message === "body too large"
      ? "Keep the entire request below 4 MB. Use smaller images or real HTTPS image URLs."
      : "Send JSON." }, error instanceof Error && error.message === "body too large" ? 413 : 400) };
  }
}

async function removeObjects(supabase: ServiceClient, paths: string[]) {
  const names = paths.filter((path) => path.length > 0);
  if (names.length === 0) return;
  await supabase.storage.from(POST_MEDIA_BUCKET).remove(names);
}

export async function getDotArtJob(request: Request, id: string) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;

  const loaded = await loadJob(auth.supabase, parsedId.id);
  if (!loaded.ok) return loaded.response;
  const view = await loadArtView(auth.supabase, loaded.job);
  if (!view.ok) return view.response;
  return json(view.body);
}

export async function claimDotArtJob(request: Request, id: string, renew = false) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;
  const parsed = await callbackBody(request);
  if (!parsed.ok) return parsed.response;
  const token = readLeaseToken(parsed.body);
  if (!token) return json({ error: "Send a UUID lease_token and reuse it for retries." }, 400);
  const result = await auth.supabase.rpc(renew ? "renew_dot_art_job" : "claim_dot_art_job", {
    target_job_id: parsedId.id, worker_token: token,
  });
  if (result.error) return rpcFailure(result.error);
  if (renew || result.data?.status === "failed") return json(result.data);
  const loaded = await loadJob(auth.supabase, parsedId.id);
  if (!loaded.ok) return loaded.response;
  const view = await loadArtView(auth.supabase, loaded.job);
  if (!view.ok) return view.response;
  return json({ ...(view.body as Record<string, unknown>), lease: result.data });
}

export async function failDotArtJob(request: Request, id: string) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;

  const parsed = await callbackBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const token = readLeaseToken(body);
  if (!token) return json({ error: "Send the claim's lease_token." }, 400);
  const reason = parseFailReason(body);
  if (!reason.ok) return json({ error: reason.error }, 400);
  const retryable = (body as Record<string, unknown>).retryable;
  if (typeof retryable !== "boolean") return json({ error: "Send retryable as true or false." }, 400);
  const result = await auth.supabase.rpc("fail_dot_art_job", {
    target_job_id: parsedId.id, worker_token: token, reason: reason.error, retryable,
  });
  return result.error ? rpcFailure(result.error) : json(result.data);
}

export async function completeDotArtJob(request: Request, id: string) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;

  const parsed = await callbackBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const token = readLeaseToken(body);
  if (!token) return json({ error: "Send the claim's lease_token." }, 400);
  const images = parseCompleteImages(body);
  if (!images.ok) return json({ error: images.error }, 400);
  const requestHash = artCompletionHash(images.images);

  const loaded = await loadJob(auth.supabase, parsedId.id);
  if (!loaded.ok) return loaded.response;
  const job = loaded.job;
  if (job.status === "done" && job.leaseToken === token && job.completionHash === requestHash) {
    return json(job.completionResult);
  }
  if (job.status === "done" || job.status === "failed") {
    return json({ error: "This art job is already finished." }, 409);
  }
  if (job.status !== "processing" || job.leaseToken !== token || !job.leaseExpiresAt
    || Date.parse(job.leaseExpiresAt) <= Date.now()) {
    return json({ error: "An active matching lease is required." }, 409);
  }
  if (!job.expectedPositions?.length || images.images.length !== job.expectedPositions.length) {
    return json({ error: "Send the full expected image set in one completion." }, 422);
  }

  const context = await loadPostContext(auth.supabase, job);
  if (!context.ok) {
    if (context.status >= 500) await releaseForRetry(auth.supabase, job.id, token, context.error);
    return json({ error: context.error }, context.status);
  }

  if (context.target.kind !== job.expectedKind) return json({ error: "The pack format changed. Queue a new job." }, 409);
  const inserts = job.expectedPositions.map((position, imageIndex) => ({ position, imageIndex }));
  const files = await collectArtFiles(images.images);
  if (!files.ok) {
    const transient = files.error.includes("could not be reached");
    if (transient) await releaseForRetry(auth.supabase, job.id, token, files.error);
    return json({ error: files.error }, transient ? 503 : 422);
  }

  const uploaded: string[] = [];
  const rows: {
    id: string;
    position: number;
    storage_path: string;
    mime_type: ImageMime;
    byte_size: number;
  }[] = [];

  for (const insert of inserts) {
    const file = files.files[insert.imageIndex];
    if (!file) {
      await removeObjects(auth.supabase, uploaded);
      return json({ error: "An image was missing." }, 422);
    }
    const mediaId = randomUUID();
    let path: string;
    try {
      path = mediaObjectPath({
        agencyId: context.agencyId,
        clientId: job.clientId,
        postId: job.postId,
        mediaId,
        extension: file.extension,
      });
    } catch {
      await removeObjects(auth.supabase, uploaded);
      return json({ error: "That image could not be saved." }, 500);
    }

    const stored = await auth.supabase.storage.from(POST_MEDIA_BUCKET).upload(path, Buffer.from(file.bytes), {
      contentType: file.mime,
      upsert: false,
    });
    if (stored.error) {
      await removeObjects(auth.supabase, uploaded);
      const message = "That image could not be saved to the pack.";
      await releaseForRetry(auth.supabase, job.id, token, message);
      return json({ error: message }, 500);
    }
    uploaded.push(path);
    rows.push({
      id: mediaId,
      position: insert.position,
      storage_path: path,
      mime_type: file.mime,
      byte_size: file.bytes.byteLength,
    });
  }

  const completed = await auth.supabase.rpc("complete_dot_art_job_v2", {
    target_job_id: job.id,
    target_kind: context.target.kind,
    rows,
    worker_token: token,
    request_hash: requestHash,
  });

  if (completed.error) {
    // Only definite transaction rejection permits cleanup. A transport error may
    // hide a committed completion: deleting those files would break the pack.
    if (["P0001", "23505", "23514", "23503", "22P02"].includes(completed.error.code)) {
      await removeObjects(auth.supabase, uploaded);
    }
    return rpcFailure(completed.error);
  }
  if (completed.data?.replayed) await removeObjects(auth.supabase, uploaded);
  return json(completed.data);
}

async function loadPostContext(supabase: ServiceClient, job: ArtJob): Promise<
  | {
      ok: true;
      agencyId: string;
      target: ReturnType<typeof artTarget>;
    }
  | { ok: false; error: string; status: number }
> {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, client_id, format")
    .eq("id", job.postId)
    .maybeSingle();
  if (postError) return { ok: false, error: "The pack could not be read.", status: 500 };
  if (!post || post.client_id !== job.clientId || !isPostFormat(post.format)) {
    return { ok: false, error: "That pack is not on this studio.", status: 404 };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, agency_id")
    .eq("id", job.clientId)
    .maybeSingle();
  if (clientError) return { ok: false, error: "The client could not be read.", status: 500 };
  if (!client?.agency_id) return { ok: false, error: "That pack is not on this studio.", status: 404 };

  const target = artTarget(post.format);
  return {
    ok: true,
    agencyId: client.agency_id,
    target,
  };
}

async function loadArtView(
  supabase: ServiceClient,
  job: CallbackJob,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, client_id, title, hook, format, platform, pack")
    .eq("id", job.postId)
    .maybeSingle();
  if (postError) return { ok: false, response: json({ error: "The pack could not be read." }, 500) };
  if (!post || post.client_id !== job.clientId || !isPostFormat(post.format)) {
    return { ok: false, response: json({ error: "That pack is not on this studio." }, 404) };
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, slug, brand")
    .eq("id", job.clientId)
    .maybeSingle();
  if (clientError) return { ok: false, response: json({ error: "The client could not be read." }, 500) };
  if (!client) return { ok: false, response: json({ error: "That pack is not on this studio." }, 404) };

  const target = artTarget(post.format);
  const { data: media, error: mediaError } = await supabase
    .from("post_media")
    .select("position")
    .eq("post_id", job.postId)
    .eq("kind", target.kind);
  if (mediaError) {
    return { ok: false, response: json({ error: "The images on this pack could not be read." }, 500) };
  }

  const positions = (media ?? []).map((row) => row.position);
  const slots = describeArtSlots({
    format: post.format,
    positions: job.hold ? [] : positions,
    replace: job.hold ? false : job.replace,
  });
  if (job.expectedPositions) {
    slots.emptyPositions = job.expectedPositions;
    slots.empty = job.expectedPositions.length;
  }
  const brand = brandFromRow(client.brand);
  const pack = packFromRow(post.pack);
  const notes = await notesForDot(supabase, job);
  const brief = buildArtBrief({
    clientName: client.name,
    clientSlug: client.slug,
    postId: job.postId,
    brand,
    post: {
      title: post.title,
      hook: post.hook,
      format: post.format,
      platform: post.platform,
      pack,
    },
    notes,
    slots,
    hold: job.hold,
  });

  return {
    ok: true,
    body: {
      job: jobJson(job),
      brief,
      brand,
      post: {
        title: post.title,
        hook: post.hook,
        format: post.format,
        platform: post.platform,
        pack,
      },
      pack_path: packPath(client.slug, job.postId),
      slots: slotsJson(slots),
    },
  };
}

async function notesForDot(supabase: ServiceClient, job: ArtJob): Promise<string | null> {
  if (!job.batchId) return job.notes;
  const { data, error } = await supabase
    .from("batch_jobs")
    .select("style_note, reference_urls")
    .eq("id", job.batchId)
    .maybeSingle();
  if (error || !data) return job.notes;

  const { data: images } = await supabase
    .from("batch_references")
    .select("storage_path")
    .eq("batch_id", job.batchId);
  const paths = (images ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  let signed: string[] = [];
  if (paths.length > 0) {
    const result = await supabase.storage
      .from(BATCH_REFERENCE_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    signed = (result.data ?? []).flatMap((item) => (item.signedUrl ? [item.signedUrl] : []));
  }

  const text = batchBriefNotes({
    styleNote: typeof data.style_note === "string" ? data.style_note : "",
    referenceUrls: referenceUrlsFromRow(data.reference_urls),
    referenceImageUrls: signed,
    revisionNote: job.notes,
  });
  return text || job.notes;
}
