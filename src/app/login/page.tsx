import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const initialMode = params.mode === "signup" ? "signup" : "signin";
  const configured = isSupabaseConfigured();

  if (configured) {
    const user = await getCurrentUser();
    if (user) redirect("/studio");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="font-display text-sm tracking-tight text-gold">
        Content Studio
      </Link>
      <h1 className="mt-4 font-display text-4xl tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Email and password, or a magic link. Everyone on the studio has the
        same access.
      </p>
      <div className="mt-8 rounded-lg border border-line bg-paper-2 p-5">
        {configured ? (
          <LoginForm notice={params.error ?? null} initialMode={initialMode} />
        ) : (
          <p className="text-sm leading-6 text-ink-soft">
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
            <code>.env.local</code>, then restart the dev server. Use the anon
            key or the newer publishable key in that variable. Do not put the
            service role key in a <code>NEXT_PUBLIC_</code> variable.
          </p>
        )}
      </div>
    </main>
  );
}
