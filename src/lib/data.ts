import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { brandFromRow, type BrandProfile } from "@/lib/brand";
import {
  BRAND_JOB_COLUMNS,
  brandJobFromRow,
  brandJobsQueryError,
  type BrandJobSnapshot,
} from "@/lib/brand-job";
import {
  POST_MEDIA_BUCKET,
  isPostMediaKind,
  type PostMediaKind,
} from "@/lib/media";
import { packFromRow } from "@/lib/pack";
import { POST_ID_RE, isPostFormat, isPostStatus, type Post, type PostStatus } from "@/lib/posts";
import { postOverlapsRange } from "@/lib/shot-list";
import { createClient } from "@/lib/supabase/server";

export type Agency = {
  id: string;
  name: string;
};

export type ClientSummary = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type ClientRecord = ClientSummary & {
  brand: BrandProfile;
};

export type PostMediaRecord = {
  id: string;
  post_id: string;
  kind: PostMediaKind;
  position: number;
  storage_path: string;
  mime_type: string;
  byte_size: number;
};

export type AgencyMember = {
  user_id: string;
  email: string;
  joined_at: string;
};

type AgencyEmbed = {
  id: string;
  name: string;
};

export const getCurrentAgency = cache(async (): Promise<Agency | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agency_members")
    .select("created_at, agencies(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const agency = data?.agencies as AgencyEmbed | AgencyEmbed[] | null;
  const row = Array.isArray(agency) ? agency[0] : agency;
  if (!row) return null;

  return { id: row.id, name: row.name };
});

export async function listClients(agencyId: string): Promise<ClientSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, slug, created_at")
    .eq("agency_id", agencyId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listMembers(agencyId: string): Promise<AgencyMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_agency_members", {
    target_agency_id: agencyId,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as AgencyMember[];
}

const postColumns =
  "id, title, hook, status, format, platform, starts_on, ends_on, pack";

function asPost(row: {
  id: string;
  title: string;
  hook: string;
  status: string;
  format: string;
  platform: string;
  starts_on: string;
  ends_on: string | null;
  pack: unknown;
}): Post {
  if (!isPostStatus(row.status) || !isPostFormat(row.format)) {
    throw new Error("A calendar post has a status or type this app does not know.");
  }
  return {
    id: row.id,
    title: row.title,
    hook: row.hook,
    status: row.status,
    format: row.format,
    platform: row.platform,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    pack: packFromRow(row.pack),
  };
}

export async function listPostsForMonth(
  clientId: string,
  monthStart: string,
  monthEnd: string,
): Promise<Post[]> {
  const supabase = await createClient();
  const [startedHere, stillRunning] = await Promise.all([
    supabase
      .from("posts")
      .select(postColumns)
      .eq("client_id", clientId)
      .gte("starts_on", monthStart)
      .lte("starts_on", monthEnd),
    supabase
      .from("posts")
      .select(postColumns)
      .eq("client_id", clientId)
      .lt("starts_on", monthStart)
      .gte("ends_on", monthStart),
  ]);

  if (startedHere.error) throw new Error(startedHere.error.message);
  if (stillRunning.error) throw new Error(stillRunning.error.message);

  const rows = [...(startedHere.data ?? []), ...(stillRunning.data ?? [])];
  return rows
    .map(asPost)
    .filter((post) => {
      const end = post.ends_on ?? post.starts_on;
      return post.starts_on <= monthEnd && end >= monthStart;
    })
    .sort(
      (a, b) => a.starts_on.localeCompare(b.starts_on) || a.title.localeCompare(b.title),
    );
}

export async function listPostsOverlapping(
  clientId: string,
  rangeStart: string,
  rangeEnd: string,
  statuses: readonly PostStatus[],
): Promise<Post[]> {
  if (statuses.length === 0) return [];

  const supabase = await createClient();
  const statusList = [...statuses];
  const [startedHere, stillRunning] = await Promise.all([
    supabase
      .from("posts")
      .select(postColumns)
      .eq("client_id", clientId)
      .in("status", statusList)
      .gte("starts_on", rangeStart)
      .lte("starts_on", rangeEnd),
    supabase
      .from("posts")
      .select(postColumns)
      .eq("client_id", clientId)
      .in("status", statusList)
      .lt("starts_on", rangeStart)
      .gte("ends_on", rangeStart),
  ]);

  if (startedHere.error) throw new Error(startedHere.error.message);
  if (stillRunning.error) throw new Error(stillRunning.error.message);

  const allowed = new Set<string>(statusList);
  const byId = new Map<string, Post>();
  for (const row of [...(startedHere.data ?? []), ...(stillRunning.data ?? [])]) {
    const post = asPost(row);
    if (!allowed.has(post.status)) continue;
    if (!postOverlapsRange(post.starts_on, post.ends_on, rangeStart, rangeEnd)) continue;
    byId.set(post.id, post);
  }

  return [...byId.values()].sort(
    (a, b) => a.starts_on.localeCompare(b.starts_on) || a.title.localeCompare(b.title),
  );
}

export async function listClientPosts(clientId: string): Promise<Post[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(postColumns)
    .eq("client_id", clientId)
    .order("starts_on", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(asPost);
}

const mediaColumns = "id, post_id, kind, position, storage_path, mime_type, byte_size";

function asMedia(row: {
  id: string;
  post_id: string;
  kind: string;
  position: number;
  storage_path: string;
  mime_type: string;
  byte_size: number;
}): PostMediaRecord {
  if (!isPostMediaKind(row.kind)) {
    throw new Error("A post image has a kind this app does not know.");
  }
  return {
    id: row.id,
    post_id: row.post_id,
    kind: row.kind,
    position: row.position,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
  };
}

export async function listPostMedia(postId: string): Promise<PostMediaRecord[]> {
  if (!POST_ID_RE.test(postId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_media")
    .select(mediaColumns)
    .eq("post_id", postId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(asMedia);
}

export async function listMediaForPosts(postIds: string[]): Promise<PostMediaRecord[]> {
  const ids = postIds.filter((id) => POST_ID_RE.test(id));
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const rows: PostMediaRecord[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from("post_media")
      .select(mediaColumns)
      .in("post_id", batch)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []).map(asMedia));
  }
  return rows;
}

export async function signedMediaUrls(
  paths: string[],
  expiresIn: number,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path) => path.length > 0))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;

  const supabase = await createClient();
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const { data, error } = await supabase.storage
      .from(POST_MEDIA_BUCKET)
      .createSignedUrls(batch, expiresIn);
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    }
  }
  return urls;
}

export const getClientPost = cache(
  async (clientId: string, postId: string): Promise<Post | null> => {
    if (!POST_ID_RE.test(postId)) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("posts")
      .select(postColumns)
      .eq("client_id", clientId)
      .eq("id", postId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return asPost(data);
  },
);

export async function getBrandJobSnapshot(clientId: string): Promise<BrandJobSnapshot> {
  const supabase = await createClient();
  const [latestResult, openResult, doneResult] = await Promise.all([
    supabase
      .from("brand_jobs")
      .select(BRAND_JOB_COLUMNS)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("brand_jobs")
      .select(BRAND_JOB_COLUMNS)
      .eq("client_id", clientId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("brand_jobs")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "done")
      .limit(1)
      .maybeSingle(),
  ]);

  const error = latestResult.error ?? openResult.error ?? doneResult.error;
  if (error) throw new Error(brandJobsQueryError(error));

  return {
    latest: brandJobFromRow(latestResult.data),
    open: brandJobFromRow(openResult.data),
    hasCompleted: Boolean(doneResult.data),
  };
}

export const getClientBySlug = cache(
  async (slug: string): Promise<ClientRecord | null> => {
    const agency = await getCurrentAgency();
    if (!agency) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, slug, created_at, brand")
      .eq("agency_id", agency.id)
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      created_at: data.created_at,
      brand: brandFromRow(data.brand),
    };
  },
);
