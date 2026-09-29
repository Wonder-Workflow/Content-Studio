import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAgency } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) redirect("/login");

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const agency = await getCurrentAgency();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader email={user.email} agencyName={agency?.name ?? null} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</div>
    </div>
  );
}
