import { notFound } from "next/navigation";
import { PackEditor } from "@/components/pack-editor";
import { type ArtJobSnapshot } from "@/lib/art-job";
import {
  getArtJobSnapshot,
  getClientBySlug,
  getClientPost,
  getPendingArt,
  listPostMedia,
  signedMediaUrls,
  type PendingArt,
} from "@/lib/data";
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
  let artSnapshot: ArtJobSnapshot = { latest: null, open: null };
  let artLoadError: string | null = null;
  try {
    artSnapshot = await getArtJobSnapshot(post.id);
  } catch (error) {
    artLoadError = error instanceof Error ? error.message : "Image generation is unavailable.";
  }
  let pending: PendingArt | null = null;
  try {
    pending = await getPendingArt(post.id);
  } catch {
    pending = null;
  }
  let previews = new Map<string, string>();
  try {
    previews = await signedMediaUrls(
      [
        ...records.map((item) => item.storage_path),
        ...(pending?.items.map((item) => item.storagePath) ?? []),
      ],
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
      artSnapshot={artSnapshot}
      artLoadError={artLoadError}
      pendingArt={
        pending
          ? {
              jobId: pending.jobId,
              previews: pending.items.map((item) => ({
                id: item.id,
                url: previews.get(item.storagePath) ?? null,
              })),
            }
          : null
      }
    />
  );
}
