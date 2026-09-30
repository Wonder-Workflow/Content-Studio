import { notFound } from "next/navigation";
import { BrandEditor } from "@/components/brand-editor";
import { BrandPullPanel } from "@/components/brand-pull-panel";
import { type BrandJobSnapshot } from "@/lib/brand-job";
import { getBrandJobSnapshot, getClientBySlug } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} brand` : "Brand" };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  let snapshot: BrandJobSnapshot = { latest: null, open: null, hasCompleted: false };
  let loadError: string | null = null;
  try {
    snapshot = await getBrandJobSnapshot(client.id);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Brand pull is unavailable.";
  }

  return (
    <div className="flex flex-col gap-10">
      <BrandPullPanel clientId={client.id} snapshot={snapshot} loadError={loadError} />
      <BrandEditor clientId={client.id} clientName={client.name} brand={client.brand} />
    </div>
  );
}
