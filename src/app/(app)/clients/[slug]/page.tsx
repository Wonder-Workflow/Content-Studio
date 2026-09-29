import { notFound } from "next/navigation";
import { SectionStub } from "@/components/section-stub";
import { getClientBySlug } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} calendar` : "Calendar" };
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  return (
    <SectionStub kicker="Calendar" title="Nothing scheduled yet">
      <p>
        The month view for {client.name} will live here, with posts pinned to
        dates. This version does not store or render a calendar.
      </p>
    </SectionStub>
  );
}
