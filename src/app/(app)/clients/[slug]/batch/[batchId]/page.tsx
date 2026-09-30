import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchRevise } from "@/components/batch-revise";
import { statusClass } from "@/components/status-chip";
import { quietButtonClass } from "@/components/styles";
import { ART_JOB_STATUS_LABELS, type ArtJob } from "@/lib/art-job";
import { formatLongDate } from "@/lib/calendar";
import {
  getBatch,
  getClientBySlug,
  listArtJobsForPosts,
  listBatchPosts,
  listBatchReferences,
  listBatchRevisions,
  signedReferenceUrls,
} from "@/lib/data";
import { STATUS_LABELS } from "@/lib/posts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; batchId: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} · Batch` : "Batch" };
}

function latestJobs(jobs: ArtJob[]): Map<string, ArtJob> {
  const map = new Map<string, ArtJob>();
  for (const job of jobs) {
    const current = map.get(job.postId);
    if (!current || job.createdAt >= current.createdAt) map.set(job.postId, job);
  }
  return map;
}

export default async function BatchPage({
  params,
}: {
  params: Promise<{ slug: string; batchId: string }>;
}) {
  const { slug, batchId } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const batch = await getBatch(client.id, batchId);
  if (!batch) notFound();

  const [posts, references, revisions] = await Promise.all([
    listBatchPosts(client.id, batch.id),
    listBatchReferences(batch.id),
    listBatchRevisions(batch.id),
  ]);
  let jobs: ArtJob[] = [];
  let jobsError: string | null = null;
  try {
    jobs = await listArtJobsForPosts(posts.map((post) => post.id));
  } catch (error) {
    jobsError = error instanceof Error ? error.message : "Image jobs could not be read.";
  }
  const byPost = latestJobs(jobs);
  let previews = new Map<string, string>();
  try {
    previews = await signedReferenceUrls(references.map((item) => item.storagePath));
  } catch {
    previews = new Map();
  }
  const queued = [...byPost.values()].filter(
    (job) => job.status === "queued" || job.status === "processing",
  ).length;

  return (
    <section>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Batch</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">{client.name}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        {formatLongDate(batch.startsOn)} – {formatLongDate(batch.endsOn)}. {posts.length}{" "}
        {posts.length === 1 ? "draft" : "drafts"} on the calendar.
        {jobsError
          ? ` ${jobsError}`
          : queued > 0
            ? ` ${queued} image ${queued === 1 ? "job is" : "jobs are"} still open. DOT can pull them from the plugin. If Slack is connected, it was asked in #content.`
            : " Image jobs are listed on each pack."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className={quietButtonClass} href={`/clients/${client.slug}?month=${batch.startsOn.slice(0, 7)}`}>
          Open calendar
        </Link>
        <Link className={quietButtonClass} href={`/clients/${client.slug}/batch`}>
          New batch
        </Link>
      </div>

      <dl className="mt-6 grid max-w-2xl gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Carousels / week</dt>
          <dd className="mt-1 font-medium">{batch.mix.Carousel}</dd>
        </div>
        <div>
          <dt className="text-muted">Static posts / week</dt>
          <dd className="mt-1 font-medium">{batch.mix.Post}</dd>
        </div>
        <div>
          <dt className="text-muted">Reel covers / week</dt>
          <dd className="mt-1 font-medium">{batch.mix.Reel}</dd>
        </div>
      </dl>

      {batch.styleNote ? (
        <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-6">{batch.styleNote}</p>
      ) : (
        <p className="mt-4 text-sm text-muted">No style note on this batch.</p>
      )}

      {batch.referenceUrls.length > 0 ? (
        <ul className="mt-3 max-w-2xl space-y-1 text-sm">
          {batch.referenceUrls.map((url) => (
            <li key={url}>
              <a className="break-all text-ink underline decoration-line underline-offset-2" href={url}>
                {url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {references.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-3">
          {references.map((item, index) => {
            const url = previews.get(item.storagePath);
            return (
              <li key={item.id} className="w-28">
                {url ? (
                  <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line">
                    <Image
                      src={url}
                      alt={`Reference ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="112px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-line px-1 text-center text-xs text-muted">
                    Reference {index + 1}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {posts.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No drafts were saved for this batch.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {posts.map((post) => {
            const job = byPost.get(post.id) ?? null;
            return (
              <li key={post.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/clients/${client.slug}/packs/${post.id}`}
                    className="font-display text-xl tracking-tight hover:text-gold"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-1 truncate text-sm text-muted">{post.hook || "No hook yet"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
                  <span className={`rounded-full px-2.5 py-1 ${statusClass(post.status)}`}>
                    {STATUS_LABELS[post.status]}
                  </span>
                  <span>{post.format}</span>
                  <span>{formatLongDate(post.starts_on)}</span>
                  <span>
                    {job ? ART_JOB_STATUS_LABELS[job.status] : "No image job"}
                    {job?.hold && job.status !== "failed" ? " · held" : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        <BatchRevise clientId={client.id} batchId={batch.id} />
      </div>

      {revisions.length > 0 ? (
        <div className="mt-8 max-w-2xl">
          <h3 className="font-display text-xl tracking-tight">Revisions</h3>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {revisions.map((revision) => {
              const post = posts.find((item) => item.id === revision.postId);
              return (
                <li key={revision.id} className="py-3 text-sm">
                  <p className="text-muted">
                    {post ? post.title : revision.postId ? "One pack" : "Whole batch"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{revision.note}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
