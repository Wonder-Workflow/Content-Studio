import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { buttonClass, quietButtonClass } from "@/components/styles";

export default async function HomePage() {
  const configured = isSupabaseConfigured();

  if (configured) {
    const user = await getCurrentUser();
    if (user) redirect("/studio");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20">
      <p className="font-display text-xs uppercase tracking-[0.18em] text-gold">
        Agency tool
      </p>
      <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] tracking-tight">
        One studio. A board for every client.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">
        Content Studio is where the team signs in and keeps client work in one
        place. Each client board has a calendar. Packs, brand notes, and the
        shot list are still placeholders.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className={buttonClass} href="/login">
          Sign in
        </Link>
        <Link className={quietButtonClass} href="/login?mode=signup">
          Create an account
        </Link>
      </div>
      {configured ? null : (
        <p className="mt-8 max-w-xl rounded-md border border-line bg-paper-2 px-4 py-3 text-sm leading-6 text-ink-soft">
          Supabase is not connected yet. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and add{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. The README lists the
          dashboard steps.
        </p>
      )}
    </main>
  );
}
