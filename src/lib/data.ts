import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
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
