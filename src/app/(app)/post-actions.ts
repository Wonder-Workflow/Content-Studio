"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeRange } from "@/lib/calendar";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgency } from "@/lib/data";
import { POST_MEDIA_BUCKET } from "@/lib/media";
import { readPackFields, type PackBody } from "@/lib/pack";
import {
  HOOK_MAX,
  PLATFORM_MAX,
  POST_ID_RE,
  TITLE_MAX,
  isPostFormat,
  isPostStatus,
} from "@/lib/posts";
import { createClient } from "@/lib/supabase/server";

export type PostFormState = {
  error: string | null;
};

type ClientRef = { id: string; slug: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

type ClientAccess =
  | { ok: false; error: string }
  | { ok: true; client: ClientRef; supabase: Supabase };

type PostFields =
  | { ok: false; error: string }
  | {
      ok: true;
      title: string;
      hook: string;
      status: "idea" | "in-creation" | "ready" | "published";
      format: "Reel" | "Post" | "Carousel" | "Story";
      platform: string;
      startsOn: string;
      endsOn: string | null;
    };

function dbError(error: { code?: string; message: string }) {
  if (error.code === "23514") {
    return "Check the title, hook, shot list, caption, call to action, status, type, and dates, then try again.";
  }
  if (error.code === "42501") {
    return "You cannot edit posts for this client.";
  }
  return error.message;
}

async function requireClient(clientId: string): Promise<ClientAccess> {
  if (!POST_ID_RE.test(clientId)) {
    return { ok: false, error: "That client is not on this studio." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in before editing the calendar." };

  const agency = await getCurrentAgency();
  if (!agency) return { ok: false, error: "Create a studio before editing the calendar." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug")
    .eq("id", clientId)
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That client is not on this studio." };

  return { ok: true, client: data, supabase };
}

function cleanTitle(value: FormDataEntryValue | null) {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!title) return { error: "Enter a title." as const, title: "" };
  if (title.length > TITLE_MAX) {
    return { error: `Title must be ${TITLE_MAX} characters or fewer.` as const, title };
  }
  return { error: null, title };
}

function cleanHook(value: FormDataEntryValue | null) {
  const hook = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (hook.length > HOOK_MAX) {
    return { error: `Hook must be ${HOOK_MAX} characters or fewer.` as const, hook };
  }
  return { error: null, hook };
}

function cleanPlatform(value: FormDataEntryValue | null) {
  const platform = String(value ?? "").trim().replace(/\s+/g, " ");
  if (platform.length > PLATFORM_MAX) {
    return {
      error: `Platform must be ${PLATFORM_MAX} characters or fewer.` as const,
      platform,
    };
  }
  return { error: null, platform };
}

function readPostFields(formData: FormData): PostFields {
  const title = cleanTitle(formData.get("title"));
  if (title.error) return { ok: false, error: title.error };

  const hook = cleanHook(formData.get("hook"));
  if (hook.error) return { ok: false, error: hook.error };

  const status = String(formData.get("status") ?? "");
  if (!isPostStatus(status)) return { ok: false, error: "Choose a status." };

  const format = String(formData.get("format") ?? "");
  if (!isPostFormat(format)) return { ok: false, error: "Choose a type." };

  const platform = cleanPlatform(formData.get("platform"));
  if (platform.error) return { ok: false, error: platform.error };

  const range = normalizeRange(
    String(formData.get("startsOn") ?? ""),
    String(formData.get("endsOn") ?? ""),
  );
  if (!range.ok) return { ok: false, error: range.error };

  return {
    ok: true,
    title: title.title,
    hook: hook.hook,
    status,
    format,
    platform: platform.platform,
    startsOn: range.startsOn,
    endsOn: range.endsOn,
  };
}

export async function savePost(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const clientId = String(formData.get("clientId") ?? "");
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };

  const fields = readPostFields(formData);
  if (!fields.ok) return { error: fields.error };

  const postId = String(formData.get("postId") ?? "").trim();

  let pack: PackBody | null = null;
  if (String(formData.get("includePack") ?? "") === "1") {
    const parsed = readPackFields(formData);
    if (!parsed.ok) return { error: parsed.error };
    pack = parsed.pack;
  }

  const payload = {
    title: fields.title,
    hook: fields.hook,
    status: fields.status,
    format: fields.format,
    platform: fields.platform,
    starts_on: fields.startsOn,
    ends_on: fields.endsOn,
    ...(pack ? { pack } : {}),
  };

  const returnToPack = String(formData.get("returnTo") ?? "") === "pack";
  let savedId = postId;

  if (postId) {
    if (!POST_ID_RE.test(postId)) return { error: "That post is not on this calendar." };
    const { data, error } = await access.supabase
      .from("posts")
      .update(payload)
      .eq("id", postId)
      .eq("client_id", access.client.id)
      .select("id")
      .maybeSingle();
    if (error) return { error: dbError(error) };
    if (!data) return { error: "That post is not on this calendar." };
    savedId = data.id;
  } else {
    const { data, error } = await access.supabase
      .from("posts")
      .insert({
        ...payload,
        client_id: access.client.id,
      })
      .select("id")
      .maybeSingle();
    if (error) return { error: dbError(error) };
    if (!data) return { error: "That post could not be saved." };
    savedId = data.id;
  }

  const slug = access.client.slug;
  revalidatePath(`/clients/${slug}`);
  revalidatePath(`/clients/${slug}/packs`);
  if (savedId) revalidatePath(`/clients/${slug}/packs/${savedId}`);
  if (returnToPack && savedId) redirect(`/clients/${slug}/packs/${savedId}`);
  redirect(`/clients/${slug}?month=${fields.startsOn.slice(0, 7)}`);
}

export async function deletePost(
  postId: string,
  clientId: string,
): Promise<PostFormState> {
  const access = await requireClient(clientId);
  if (!access.ok) return { error: access.error };
  if (!POST_ID_RE.test(postId)) return { error: "That post is not on this calendar." };

  const media = await access.supabase
    .from("post_media")
    .select("storage_path")
    .eq("post_id", postId)
    .eq("client_id", access.client.id);
  if (media.error) return { error: dbError(media.error) };
  const paths = (media.data ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  if (paths.length > 0) {
    await access.supabase.storage.from(POST_MEDIA_BUCKET).remove(paths);
  }

  const { data, error } = await access.supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("client_id", access.client.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: dbError(error) };
  if (!data) return { error: "That post is not on this calendar." };

  revalidatePath(`/clients/${access.client.slug}`);
  revalidatePath(`/clients/${access.client.slug}/packs`);
  revalidatePath(`/clients/${access.client.slug}/packs/${postId}`);
  return { error: null };
}

export async function movePost(input: {
  postId: string;
  clientId: string;
  startsOn: string;
  endsOn: string | null;
}): Promise<PostFormState & { startsOn?: string }> {
  const access = await requireClient(input.clientId);
  if (!access.ok) return { error: access.error };
  if (!POST_ID_RE.test(input.postId)) return { error: "That post is not on this calendar." };

  const range = normalizeRange(input.startsOn, input.endsOn);
  if (!range.ok) return { error: range.error };

  const { data, error } = await access.supabase
    .from("posts")
    .update({ starts_on: range.startsOn, ends_on: range.endsOn })
    .eq("id", input.postId)
    .eq("client_id", access.client.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: dbError(error) };
  if (!data) return { error: "That post is not on this calendar." };

  revalidatePath(`/clients/${access.client.slug}`);
  revalidatePath(`/clients/${access.client.slug}/packs`);
  revalidatePath(`/clients/${access.client.slug}/packs/${input.postId}`);
  return { error: null, startsOn: range.startsOn };
}
