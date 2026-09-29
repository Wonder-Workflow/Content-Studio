import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { quietButtonClass } from "@/components/styles";

export function AppHeader({
  email,
  agencyName,
}: {
  email: string | null;
  agencyName: string | null;
}) {
  return (
    <header className="border-b border-line bg-paper-2/90">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/studio" className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center border border-gold font-display text-xs tracking-wide text-gold">
            CS
          </span>
          <span className="flex flex-col">
            <span className="font-display text-base leading-none tracking-tight">
              Content Studio
            </span>
            <span className="mt-1 text-xs text-muted">
              {agencyName ?? "No studio yet"}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {email ? (
            <span className="hidden text-sm text-muted sm:inline">{email}</span>
          ) : null}
          <form action={signOut}>
            <button className={quietButtonClass} type="submit">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
