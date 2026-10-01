"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decideDotConsent, readDotConsentConfig } from "@/lib/dot-consent";

export async function decideConsent(form: FormData) {
  const config = readDotConsentConfig(process.env);
  const id = String(form.get("authorization_id") ?? "");
  if (!config) redirect("/oauth/consent?error=unavailable");
  const client = await createClient();
  const destination = await decideDotConsent(client, config, id, String(form.get("decision") ?? ""));
  if (!destination) redirect("/oauth/consent?error=unavailable");
  redirect(destination);
}
