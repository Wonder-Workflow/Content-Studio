import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { ShotChecklist } from "@/components/shot-checklist";
import { buttonClass, inputClass, quietButtonClass } from "@/components/styles";
import { formatLongDate } from "@/lib/calendar";
import { getClientBySlug, listPostsOverlapping } from "@/lib/data";
import {
  buildShotList,
  firstQueryValue,
  parseShotQuery,
  shootStatuses,
} from "@/lib/shot-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} shot list` : "Shot list" };
}

function scopeLabel(includeReady: boolean) {
  return includeReady ? "In-creation and Ready." : "In-creation only.";
}

function countLabel(count: number) {
  if (count === 0) return "Nothing to shoot in this range.";
  if (count === 1) return "1 post to shoot.";
  return `${count} posts to shoot.`;
}

export default async function ShotListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    ready?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const parsed = parseShotQuery({
    from: firstQueryValue(query.from),
    to: firstQueryValue(query.to),
    ready: firstQueryValue(query.ready),
  });
  const from = parsed.ok ? parsed.query.from : parsed.from;
  const to = parsed.ok ? parsed.query.to : parsed.to;
  const includeReady = parsed.ok ? parsed.query.includeReady : parsed.includeReady;
  const rows = parsed.ok
    ? buildShotList(
        await listPostsOverlapping(
          client.id,
          parsed.query.from,
          parsed.query.to,
          shootStatuses(parsed.query.includeReady),
        ),
        parsed.query,
      )
    : [];

  return (
    <section className="shot-sheet">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Shot list</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">
            {parsed.ok
              ? `${formatLongDate(parsed.query.from)} – ${formatLongDate(parsed.query.to)}`
              : "Shot list"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {parsed.ok
              ? `${scopeLabel(includeReady)} ${countLabel(rows.length)}`
              : "Pick a start and an end date. In-creation is included. Ready is optional."}
          </p>
        </div>
        <PrintButton />
      </div>

      <form
        key={`${from}|${to}|${includeReady ? "1" : "0"}`}
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 print:hidden"
      >
        <label className="flex w-44 flex-col gap-1.5 text-sm" htmlFor="shot-from">
          <span className="font-medium">From</span>
          <input
            id="shot-from"
            className={inputClass}
            type="date"
            name="from"
            defaultValue={from}
          />
        </label>
        <label className="flex w-44 flex-col gap-1.5 text-sm" htmlFor="shot-to">
          <span className="font-medium">To</span>
          <input id="shot-to" className={inputClass} type="date" name="to" defaultValue={to} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm" htmlFor="shot-ready">
          <input
            id="shot-ready"
            className="size-4 accent-gold"
            type="checkbox"
            name="ready"
            value="1"
            defaultChecked={includeReady}
          />
          Include Ready
        </label>
        <button className={buttonClass} type="submit">
          Show shots
        </button>
      </form>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted print:hidden">
        Filmed checks stay in this browser. They are not shared with the studio.
      </p>

      {parsed.ok ? null : (
        <p role="alert" className="mt-4 text-sm text-danger">
          {parsed.error}
        </p>
      )}

      {parsed.ok && rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line px-5 py-10">
          <h3 className="font-display text-2xl tracking-tight">Nothing to shoot</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            {includeReady
              ? "No In-creation or Ready posts overlap these dates."
              : "No In-creation posts overlap these dates. Ready posts stay off until you include them."}
          </p>
          <Link className={`${quietButtonClass} mt-6 print:hidden`} href={`/clients/${client.slug}`}>
            Open the calendar
          </Link>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ShotChecklist clientId={client.id} slug={client.slug} rows={rows} />
      ) : null}
    </section>
  );
}
