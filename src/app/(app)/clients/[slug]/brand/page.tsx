import { notFound } from "next/navigation";
import { BrandEditor } from "@/components/brand-editor";
import { getClientBySlug } from "@/lib/data";

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

  return (
    <BrandEditor clientId={client.id} clientName={client.name} brand={client.brand} />
  );
}
