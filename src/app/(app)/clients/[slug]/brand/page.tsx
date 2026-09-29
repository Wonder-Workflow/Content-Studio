import { notFound } from "next/navigation";
import { SectionStub } from "@/components/section-stub";
import { getClientBySlug } from "@/lib/data";

export const metadata = { title: "Brand" };

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const notes = Object.keys(client.brand);

  return (
    <SectionStub kicker="Brand" title="Brand notes are a placeholder">
      <p>
        Voice, colors, and rules for {client.name} will be edited here later.
        They are stored as JSON on the client and start as an empty object.
        Images, when they arrive, will be manual uploads — not generated in the
        app.
      </p>
      {notes.length > 0 ? (
        <pre className="mt-4 overflow-x-auto rounded-md bg-paper p-3 text-xs leading-5 text-ink">
          {JSON.stringify(client.brand, null, 2)}
        </pre>
      ) : (
        <p className="mt-4 text-muted">No brand notes yet.</p>
      )}
    </SectionStub>
  );
}
