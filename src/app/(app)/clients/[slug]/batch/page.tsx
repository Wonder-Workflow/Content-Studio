import { notFound } from "next/navigation";
import { BatchForm } from "@/components/batch-form";
import { getClientBySlug } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} · Generate batch` : "Generate batch" };
}

export default async function GenerateBatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  return (
    <section>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Generate batch</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">{client.name}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Draft a week or a month of packs from the saved brand. Set how many carousels, static
        posts, and reel covers you want each week, add a style note, and optionally point at a
        reference. The packs land on the calendar as ideas, and each one queues a DOT image job.
      </p>
      <BatchForm clientId={client.id} />
    </section>
  );
}
