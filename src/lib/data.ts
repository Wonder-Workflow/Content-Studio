import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { packFromRow } from "@/lib/pack";
import { POST_ID_RE, isPostFormat, isPostStatus, type Post } from "@/lib/posts";
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
  brand: Record<string, unknown>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBrand(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

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
      brand: asBrand(data.brand),
    };
  },
);
