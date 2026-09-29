import { notFound } from "next/navigation";
import { PackEditor } from "@/components/pack-editor";
import { getClientBySlug, getClientPost } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return { title: "Pack" };
  const post = await getClientPost(client.id, postId);
  return { title: post ? `${post.title} · Pack` : "Pack" };
}

export default async function PackPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const post = await getClientPost(client.id, postId);
  if (!post) notFound();

  return (
    <PackEditor
      key={post.id}
      clientId={client.id}
      clientName={client.name}
      slug={client.slug}
      post={post}
    />
  );
}
