import Link from "next/link";
import { notFound } from "next/navigation";
import { statusClass } from "@/components/status-chip";
import { quietButtonClass } from "@/components/styles";
import { formatLongDate } from "@/lib/calendar";
import { getClientBySlug, listClientPosts } from "@/lib/data";
import { STATUS_LABELS } from "@/lib/posts";

export const metadata = { title: "Packs" };

function scheduleLabel(startsOn: string, endsOn: string | null) {
  if (endsOn && endsOn > startsOn) {
    return `${formatLongDate(startsOn)} – ${formatLongDate(endsOn)}`;
  }
  return formatLongDate(startsOn);
}

export default async function PacksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const posts = await listClientPosts(client.id);

  return (
    <section>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Packs</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">{client.name}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Each post has one pack: the hook, the shot list and angles, the caption, the call to
        action, and any images. Add a post on the calendar, then open it here.
      </p>
      {posts.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2">
          <a className={quietButtonClass} href={`/clients/${client.slug}/export/ghl`}>
            Download GHL CSV
          </a>
          {posts.length > 90 ? (
            <p className="max-w-xl text-sm leading-6 text-muted">
              GoHighLevel accepts 90 posts in one CSV. This file has {posts.length}. Split it
              before you upload.
            </p>
          ) : null}
        </div>
      ) : null}

      {posts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line px-5 py-10">
          <h3 className="font-display text-2xl tracking-tight">No packs yet</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            The calendar is where a post starts. Once it is saved, its pack shows up here.
          </p>
          <Link className={`${quietButtonClass} mt-6`} href={`/clients/${client.slug}`}>
            Open the calendar
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/clients/${client.slug}/packs/${post.id}`}
                className="flex flex-col gap-2 py-4 transition hover:text-gold sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block font-display text-xl tracking-tight">{post.title}</span>
                  <span className="mt-1 block truncate text-sm text-muted">
                    {post.hook || "No hook yet"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
                  <span className={`rounded-full px-2.5 py-1 ${statusClass(post.status)}`}>
                    {STATUS_LABELS[post.status]}
                  </span>
                  <span>
                    {post.format}
                    {post.platform ? ` · ${post.platform}` : ""} ·{" "}
                    {scheduleLabel(post.starts_on, post.ends_on)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
