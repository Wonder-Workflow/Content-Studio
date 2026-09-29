import { notFound } from "next/navigation";
import { SectionStub } from "@/components/section-stub";
import { getClientBySlug } from "@/lib/data";

export const metadata = { title: "Packs" };

export default async function PacksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  return (
    <SectionStub kicker="Packs" title="Pack editor comes later">
      <p>
        Packs will be the working surface for {client.name}: copy, frames, and
        status. There is no pack editor in this version, and nothing is stored
        for packs yet.
      </p>
    </SectionStub>
  );
}
