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
  planArtWrites,
  artTarget,
  packPath,
  type ArtJob,
  type ArtSlotPlan,
} from "@/lib/art-job";
import { collectArtFiles, parseCompleteImages } from "@/lib/art-image";
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
  "id, client_id, post_id, agency_id, batch_id, status, error, brief, replace_media, hold_media, created_at, updated_at, completed_at";

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
): Promise<{ ok: true; job: ArtJob } | { ok: false; response: Response }> {
  const { data, error } = await supabase.from("art_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, response: json({ error: "The art job could not be read." }, 500) };
  const job = artJobFromRow(data);
  if (!job) return { ok: false, response: json({ error: "That art job was not found." }, 404) };
  return { ok: true, job };
}

function jobJson(job: ArtJob) {
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

async function markFailed(supabase: ServiceClient, jobId: string, message: string) {
  await supabase
    .from("art_jobs")
    .update({ status: "failed", error: clipArtError(message) })
    .eq("id", jobId)
    .in("status", ["queued", "processing"]);
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
  let job = loaded.job;

  if (job.status === "queued") {
    const updated = await auth.supabase
      .from("art_jobs")
      .update({ status: "processing" })
      .eq("id", job.id)
      .eq("status", "queued")
      .select(JOB_COLUMNS)
      .maybeSingle();
    const next = artJobFromRow(updated.data);
    if (next) job = next;
  }

  const view = await loadArtView(auth.supabase, job);
  if (!view.ok) return view.response;
  return json(view.body);
}

export async function failDotArtJob(request: Request, id: string) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const reason = parseFailReason(body);
  if (!reason.ok) return json({ error: reason.error }, 400);

  const { data, error } = await auth.supabase
    .from("art_jobs")
    .update({ status: "failed", error: reason.error })
    .eq("id", parsedId.id)
    .in("status", ["queued", "processing"])
    .select("id")
    .maybeSingle();

  if (error) return json({ error: "The art job could not be updated." }, 500);
  if (data) return json({ ok: true, job_id: parsedId.id, status: "failed" });

  const loaded = await loadJob(auth.supabase, parsedId.id);
  if (!loaded.ok) return loaded.response;
  return json({ error: "This art job is already finished." }, 409);
}

export async function completeDotArtJob(request: Request, id: string) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const parsedId = jobId(id);
  if (!parsedId.ok) return parsedId.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const images = parseCompleteImages(body);
  if (!images.ok) return json({ error: images.error }, 400);

  const loaded = await loadJob(auth.supabase, parsedId.id);
  if (!loaded.ok) return loaded.response;
  const job = loaded.job;
  if (job.status === "done" || job.status === "failed") {
    return json({ error: "This art job is already finished." }, 409);
  }

  const context = await loadPostContext(auth.supabase, job);
  if (!context.ok) {
    await markFailed(auth.supabase, job.id, context.error);
    return json({ error: context.error }, context.status);
  }

  const plan = planArtWrites({
    occupied: job.hold ? [] : context.positions,
    incomingCount: images.images.length,
    replace: job.hold || job.replace,
    max: context.target.count,
  });
  if (!plan.ok) {
    await markFailed(auth.supabase, job.id, plan.error);
    return json({ error: plan.error }, 422);
  }

  const chosen = images.images.slice(0, plan.plan.inserts.length);
  const files = await collectArtFiles(chosen);
  if (!files.ok) {
    await markFailed(auth.supabase, job.id, files.error);
    return json({ error: files.error }, 422);
  }

  const uploaded: string[] = [];
  const rows: {
    id: string;
    position: number;
    storage_path: string;
    mime_type: ImageMime;
    byte_size: number;
  }[] = [];

  for (const insert of plan.plan.inserts) {
    const file = files.files[insert.imageIndex];
    if (!file) {
      await removeObjects(auth.supabase, uploaded);
      await markFailed(auth.supabase, job.id, "An image was missing.");
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
      await markFailed(auth.supabase, job.id, "That image could not be saved.");
      return json({ error: "That image could not be saved." }, 500);
    }

    const stored = await auth.supabase.storage.from(POST_MEDIA_BUCKET).upload(path, Buffer.from(file.bytes), {
      contentType: file.mime,
      upsert: false,
    });
    if (stored.error) {
      await removeObjects(auth.supabase, uploaded);
      const message = "That image could not be saved to the pack.";
      await markFailed(auth.supabase, job.id, message);
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

  const completed = await auth.supabase.rpc("complete_dot_art_job", {
    target_job_id: job.id,
    target_kind: context.target.kind,
    rows,
  });

  if (completed.error) {
    await removeObjects(auth.supabase, uploaded);
    const message = completed.error.message || "The images could not be saved.";
    if (message.includes("already finished")) {
      return json({ error: "This art job is already finished." }, 409);
    }
    if (message.includes("not found")) {
      return json({ error: "That art job was not found." }, 404);
    }
    const friendly = message.includes("already filled")
      ? "That image slot is already filled."
      : "The images could not be saved on the pack.";
    await markFailed(auth.supabase, job.id, friendly);
    return json({ error: friendly }, 422);
  }

  return json({
    ok: true,
    job_id: job.id,
    status: "done",
    media: rows.map((row) => ({
      id: row.id,
      kind: context.target.kind,
      position: row.position,
    })),
  });
}

async function loadPostContext(supabase: ServiceClient, job: ArtJob): Promise<
  | {
      ok: true;
      agencyId: string;
      target: ReturnType<typeof artTarget>;
      positions: number[];
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
  const { data: media, error: mediaError } = await supabase
    .from("post_media")
    .select("position")
    .eq("post_id", job.postId)
    .eq("kind", target.kind);
  if (mediaError) return { ok: false, error: "The images on this pack could not be read.", status: 500 };

  return {
    ok: true,
    agencyId: client.agency_id,
    target,
    positions: (media ?? []).map((row) => row.position),
  };
}

async function loadArtView(
  supabase: ServiceClient,
  job: ArtJob,
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
