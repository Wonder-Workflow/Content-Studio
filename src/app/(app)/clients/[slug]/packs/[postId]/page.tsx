import { notFound } from "next/navigation";
import { PackEditor } from "@/components/pack-editor";
import { getClientBySlug, getClientPost, listPostMedia, signedMediaUrls } from "@/lib/data";
import { PREVIEW_URL_SECONDS } from "@/lib/media";

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

  const records = await listPostMedia(post.id);
  let previews = new Map<string, string>();
  try {
    previews = await signedMediaUrls(
      records.map((item) => item.storage_path),
      PREVIEW_URL_SECONDS,
    );
  } catch {
    previews = new Map();
  }

  return (
    <PackEditor
      key={post.id}
      clientId={client.id}
      clientName={client.name}
      slug={client.slug}
      post={post}
      media={records.map((item) => ({
        id: item.id,
        kind: item.kind,
        position: item.position,
        previewUrl: previews.get(item.storage_path) ?? null,
      }))}
    />
  );
}
