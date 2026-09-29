"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { requestOrigin } from "@/lib/origin";

export type AuthFormState = {
  error: string | null;
  message: string | null;
};

export async function authenticate(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return {
      error: "Add the Supabase URL and anon key before signing in.",
      message: null,
    };
  }

  const intent = String(formData.get("intent") ?? "signin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", message: null };
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const emailRedirectTo = `${origin}/auth/confirm`;

  if (intent === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo },
    });

    if (error) return { error: error.message, message: null };
    return {
      error: null,
      message: "Magic link sent. Open it on this browser to sign in.",
    };
  }

  if (password.length < 6) {
    return { error: "Password needs at least 6 characters.", message: null };
  }

  if (intent === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });

    if (error) return { error: error.message, message: null };
    if (data.session) redirect("/studio");

    return {
      error: null,
      message:
        "Account created. Confirm the email, then sign in with your password.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message, message: null };

  redirect("/studio");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
