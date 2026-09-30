"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { readBrandFields } from "@/lib/brand";
import { getCurrentAgency } from "@/lib/data";
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
  | { ok: true; client: ClientRef; supabase: Supabase };

function dbError(error: { code?: string; message: string }) {
  if (error.code === "23514") {
    return "One of the brand fields is too long. Shorten it and try again.";
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

  return { ok: true, client: data, supabase };
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
