"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgency } from "@/lib/data";
import { slugify, uniqueSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export type FormState = {
  error: string | null;
  message?: string | null;
};

function cleanName(value: FormDataEntryValue | null, label: string) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: `Enter a ${label}.` as const, name: "" };
  if (name.length > 80) {
    return { error: `${label} must be 80 characters or fewer.` as const, name };
  }
  return { error: null, name };
}

export async function createAgency(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cleanName(formData.get("name"), "studio name");
  if (parsed.error) return { error: parsed.error };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in before creating a studio." };

  const existing = await getCurrentAgency();
  if (existing) {
    redirect("/studio");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("agencies").insert({ name: parsed.name });

  if (error) return { error: error.message };

  revalidatePath("/studio");
  redirect("/studio");
}

export async function createClientBoard(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = cleanName(formData.get("name"), "client name");
  if (parsed.error) return { error: parsed.error };

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in before adding a client." };

  const agency = await getCurrentAgency();
  if (!agency) return { error: "Create a studio before adding a client." };

  const supabase = await createClient();
  const { data: existing, error: listError } = await supabase
    .from("clients")
    .select("slug")
    .eq("agency_id", agency.id);

  if (listError) return { error: listError.message };

  const slug = uniqueSlug(
    slugify(parsed.name),
    (existing ?? []).map((row) => row.slug),
  );

  const { error } = await supabase.from("clients").insert({
    agency_id: agency.id,
    name: parsed.name,
    slug,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "A client with that name already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/studio");
  redirect(`/clients/${slug}`);
}

export async function addAgencyMember(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in before adding a teammate." };

  const agency = await getCurrentAgency();
  if (!agency) return { error: "Create a studio before adding a teammate." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_agency_member", {
    target_agency_id: agency.id,
    member_email: email,
  });

  if (error) return { error: error.message };

  revalidatePath("/studio");
  return { error: null, message: "Teammate added. They can open the studio now." };
}
