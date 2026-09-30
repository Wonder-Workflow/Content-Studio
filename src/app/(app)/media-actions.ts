"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgency } from "@/lib/data";
import {
  MAX_CAROUSEL_IMAGES,
  POST_MEDIA_BUCKET,
  inspectImageFile,
  isPostMediaKind,
  mediaObjectPath,
  type PostMediaKind,
} from "@/lib/media";
import { POST_ID_RE } from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

export type MediaActionState = { error: string | null };

type ClientRef = { id: string; slug: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

type ClientAccess =
  | { ok: false; error: string }
  | { ok: true; client: ClientRef; agencyId: string; supabase: Supabase };

function dbError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return "That image slot is already filled. Refresh the pack and try again.";
  }
  if (error.code === "23514") {
    return "That image could not be saved. Use a PNG, JPEG, or WebP under 10MB.";
  }
  if (error.code === "42501") {
    return "You cannot edit images for this client.";
  }
  return error.message;
}

async function requireClient(clientId: string): Promise<ClientAccess> {
  if (!POST_ID_RE.test(clientId)) {
    return { ok: false, error: "That client is not on this studio." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in before editing images." };

  const agency = await getCurrentAgency();
  if (!agency) return { ok: false, error: "Create a studio before editing images." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug")
    .eq("id", clientId)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That client is not on this studio." };

  return { ok: true, client: data, agencyId: agency.id, supabase };
}

function revalidatePost(slug: string, postId: string) {
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/clients/${slug}/packs`);
  revalidatePath(`/clients/${slug}/packs/${postId}`);
}

function nextCarouselPosition(positions: number[]) {
  const used = new Set(positions);
  for (let position = 0; position < MAX_CAROUSEL_IMAGES; position += 1) {
    if (!used.has(position)) return position;
  }
  return null;
}

async function removeObjects(supabase: Supabase, paths: string[]) {
  const names = paths.filter((path) => path.length > 0);
  if (names.length === 0) return;
  await supabase.storage.from(POST_MEDIA_BUCKET).remove(names);
}

export async function uploadPostImage(
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };

  const postId = String(formData.get("postId") ?? "");
  if (!POST_ID_RE.test(postId)) return { error: "That post is not on this calendar." };

  const kindValue = String(formData.get("kind") ?? "");
  if (!isPostMediaKind(kindValue)) return { error: "Choose an image slot." };
  const kind: PostMediaKind = kindValue;

  const entry = formData.get("file");
  if (!(entry instanceof File)) return { error: "Choose an image." };

  const inspected = inspectImageFile({ type: entry.type, size: entry.size });
  if (!inspected.ok) return { error: inspected.error };

  const { data: post, error: postError } = await access.supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("client_id", access.client.id)
    .maybeSingle();
  if (postError) return { error: postError.message };
  if (!post) return { error: "That post is not on this calendar." };

  const { data: existing, error: existingError } = await access.supabase
    .from("post_media")
    .select("id, storage_path, position")
    .eq("post_id", postId)
    .eq("client_id", access.client.id)
    .eq("kind", kind);

  if (existingError) return { error: existingError.message };
  const rows = existing ?? [];

  if (kind === "carousel" && rows.length >= MAX_CAROUSEL_IMAGES) {
    return { error: "A carousel can have at most 10 images." };
  }

  const mediaId = randomUUID();
  let path: string;
  try {
    path = mediaObjectPath({
      agencyId: access.agencyId,
      clientId: access.client.id,
      postId,
      mediaId,
      extension: inspected.extension,
    });
  } catch {
    return { error: "That image could not be saved." };
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  const uploaded = await access.supabase.storage.from(POST_MEDIA_BUCKET).upload(path, bytes, {
    contentType: inspected.mime,
    upsert: false,
  });
  if (uploaded.error) {
    return { error: dbError(uploaded.error) };
  }

  if (kind === "carousel") {
    const position = nextCarouselPosition(rows.map((row) => row.position));
    if (position === null) {
      await removeObjects(access.supabase, [path]);
      return { error: "A carousel can have at most 10 images." };
    }
    const inserted = await access.supabase.from("post_media").insert({
      id: mediaId,
      post_id: postId,
      client_id: access.client.id,
      kind,
      position,
      storage_path: path,
      mime_type: inspected.mime,
      byte_size: entry.size,
      source: "upload",
    });
    if (inserted.error) {
      await removeObjects(access.supabase, [path]);
      return { error: dbError(inserted.error) };
    }
  } else {
    const current = rows[0];
    if (current) {
      const updated = await access.supabase
        .from("post_media")
        .update({
          storage_path: path,
          mime_type: inspected.mime,
          byte_size: entry.size,
          source: "upload",
        })
        .eq("id", current.id)
        .eq("post_id", postId)
        .eq("client_id", access.client.id);
      if (updated.error) {
        await removeObjects(access.supabase, [path]);
        return { error: dbError(updated.error) };
      }
      await removeObjects(access.supabase, [current.storage_path]);
    } else {
      const inserted = await access.supabase.from("post_media").insert({
        id: mediaId,
        post_id: postId,
        client_id: access.client.id,
        kind,
        position: 0,
        storage_path: path,
        mime_type: inspected.mime,
        byte_size: entry.size,
        source: "upload",
      });
      if (inserted.error) {
        await removeObjects(access.supabase, [path]);
        return { error: dbError(inserted.error) };
      }
    }
  }

  revalidatePost(access.client.slug, postId);
  return { error: null };
}

export async function removePostImage(input: {
  clientId: string;
  postId: string;
  mediaId: string;
}): Promise<MediaActionState> {
  const access = await requireClient(input.clientId);
  if (!access.ok) return { error: access.error };
  if (!POST_ID_RE.test(input.postId) || !POST_ID_RE.test(input.mediaId)) {
    return { error: "That image is not on this post." };
  }

  const { data, error } = await access.supabase
    .from("post_media")
    .delete()
    .eq("id", input.mediaId)
    .eq("post_id", input.postId)
    .eq("client_id", access.client.id)
    .select("storage_path")
    .maybeSingle();

  if (error) return { error: dbError(error) };
  if (!data) return { error: "That image is not on this post." };

  await removeObjects(access.supabase, [data.storage_path]);
  revalidatePost(access.client.slug, input.postId);
  return { error: null };
}

export async function reorderCarouselImages(input: {
  clientId: string;
  postId: string;
  orderedIds: string[];
}): Promise<MediaActionState> {
  const access = await requireClient(input.clientId);
  if (!access.ok) return { error: access.error };
  if (!POST_ID_RE.test(input.postId)) return { error: "That post is not on this calendar." };
  if (
    input.orderedIds.length > MAX_CAROUSEL_IMAGES ||
    input.orderedIds.some((id) => !POST_ID_RE.test(id))
  ) {
    return { error: "Refresh the pack and try the order again." };
  }

  const { error } = await access.supabase.rpc("reorder_carousel_media", {
    target_post_id: input.postId,
    ordered_ids: input.orderedIds,
  });

  if (error) return { error: dbError(error) };
  revalidatePost(access.client.slug, input.postId);
  return { error: null };
}
