import { notFound } from "next/navigation";
import { SectionStub } from "@/components/section-stub";
import { getClientBySlug } from "@/lib/data";

export const metadata = { title: "Shot list" };

export default async function ShotListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  return (
    <SectionStub kicker="Shot list" title="Shot list is not built yet">
      <p>
        Locations, frames, and what still needs to be captured for {client.name}{" "}
        will sit here. This page is only the navigation stub.
      </p>
    </SectionStub>
  );
}
