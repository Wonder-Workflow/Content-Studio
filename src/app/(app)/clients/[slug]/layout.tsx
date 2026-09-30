import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClientTabs } from "@/components/client-tabs";
import { getClientBySlug, getCurrentAgency } from "@/lib/data";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agency = await getCurrentAgency();
  if (!agency) redirect("/studio");

  const client = await getClientBySlug(slug);
  if (!client) notFound();

  return (
    <div>
      <Link
        href="/studio"
        className="text-sm text-muted transition hover:text-ink print:hidden"
      >
        All clients
      </Link>
      <h1 className="mt-3 font-display text-4xl tracking-tight print:mt-0">{client.name}</h1>
      <p className="mt-2 text-sm text-muted print:hidden">{agency.name}</p>
      <div className="mt-6 print:hidden">
        <ClientTabs slug={client.slug} />
      </div>
      <div className="mt-8 print:mt-4">{children}</div>
    </div>
  );
}
