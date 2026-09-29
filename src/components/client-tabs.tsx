"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { suffix: "", label: "Calendar" },
  { suffix: "/packs", label: "Packs" },
  { suffix: "/brand", label: "Brand" },
  { suffix: "/shot-list", label: "Shot list" },
] as const;

export function ClientTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/clients/${slug}`;

  return (
    <nav aria-label="Client sections" className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const current = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              current
                ? "bg-ink text-paper"
                : "border border-line text-ink-soft hover:border-gold"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
