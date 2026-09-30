"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { movePost } from "@/app/(app)/post-actions";
import {
  WEEKDAYS,
  addDays,
  buildMonthGrid,
  diffDays,
  formatLongDate,
  formatMonthTitle,
  rangePosition,
  shiftMonth,
  toIsoDate,
} from "@/lib/calendar";
import { STATUS_LABELS, type Post } from "@/lib/posts";
import { PostEditor } from "@/components/post-editor";
import { statusClass } from "@/components/status-chip";
import { buttonClass, quietButtonClass } from "@/components/styles";

type EditorState = { post: Post | null; startsOn: string };

type DragPayload = { id: string; fromIso: string };

export function CalendarBoard({
  clientId,
  clientName,
  slug,
  year,
  monthIndex,
  monthKey,
  posts,
}: {
  clientId: string;
  clientName: string;
  slug: string;
  year: number;
  monthIndex: number;
  monthKey: string;
  posts: Post[];
}) {
  const router = useRouter();
  const cells = buildMonthGrid(year, monthIndex);
  const title = formatMonthTitle(year, monthIndex);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [overIso, setOverIso] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const todayIso = useSyncExternalStore(subscribeToToday, readTodayIso, emptyToday);
  const [moving, startMove] = useTransition();

  const todayMonth = todayIso ? todayIso.slice(0, 7) : monthKey;
  const base = `/clients/${slug}`;

  function postsOnDay(iso: string) {
    return posts
      .filter((post) => {
        const end = post.ends_on ?? post.starts_on;
        return post.starts_on <= iso && iso <= end;
      })
      .sort((a, b) => {
        const aStarts = a.starts_on === iso ? 0 : 1;
        const bStarts = b.starts_on === iso ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      });
  }

  function openCreate(iso: string) {
    setEditor({ post: null, startsOn: iso });
  }

  function onDrop(targetIso: string, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOverIso(null);
    const raw = event.dataTransfer.getData("text/plain");
    const payload = readDragPayload(raw);
    if (!payload || payload.fromIso === targetIso) return;
    const post = posts.find((item) => item.id === payload.id);
    if (!post) return;
    const delta = diffDays(payload.fromIso, targetIso);
    if (delta === null || delta === 0) return;
    const startsOn = addDays(post.starts_on, delta);
    const endsOn = post.ends_on ? addDays(post.ends_on, delta) : null;
    if (!startsOn || (post.ends_on && !endsOn)) return;

    startMove(async () => {
      const result = await movePost({
        postId: post.id,
        clientId,
        startsOn,
        endsOn,
      });
      if (result.error) {
        setMoveError(result.error);
        return;
      }
      setMoveError(null);
      const nextMonth = (result.startsOn ?? startsOn).slice(0, 7);
      if (nextMonth !== monthKey) {
        router.push(`${base}?month=${nextMonth}`);
      }
    });
  }

  return (
    <section aria-busy={moving}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">
            Calendar
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {posts.length === 0
              ? "Nothing scheduled this month."
              : `${posts.length} ${posts.length === 1 ? "post" : "posts"} this month.`}{" "}
            Choose a day to add one. Drag a card to move it, including its date range.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className={buttonClass} href={`/clients/${slug}/batch`}>
            Generate batch
          </Link>
          <button
            className={buttonClass}
            type="button"
            onClick={() => openCreate(todayIso && todayIso.startsWith(monthKey) ? todayIso : `${monthKey}-01`)}
          >
            Add post
          </button>
          <Link
            className={`${quietButtonClass} size-10 px-0`}
            href={`${base}?month=${shiftMonth(year, monthIndex, -1)}`}
            aria-label="Previous month"
          >
            ‹
          </Link>
          <Link className={quietButtonClass} href={`${base}?month=${todayMonth}`}>
            Today
          </Link>
          <Link
            className={`${quietButtonClass} size-10 px-0`}
            href={`${base}?month=${shiftMonth(year, monthIndex, 1)}`}
            aria-label="Next month"
          >
            ›
          </Link>
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Status colors">
        {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
          <li
            key={status}
            className={`rounded-full px-2.5 py-1 text-xs ${statusClass(status)}`}
          >
            {STATUS_LABELS[status]}
          </li>
        ))}
      </ul>

      {moveError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {moveError}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="truncate px-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted sm:px-1 sm:text-[11px] sm:tracking-[0.12em]"
            >
              {day}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (!cell.iso) {
              return <div key={`empty-${index}`} aria-hidden="true" className="min-h-24" />;
            }
            const iso = cell.iso;
            const dayPosts = postsOnDay(iso);
            const isToday = iso === todayIso;
            return (
              <div
                key={iso}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIso(iso);
                }}
                onDrop={(event) => onDrop(iso, event)}
                className={`flex min-h-20 flex-col gap-1 rounded-lg border bg-paper-2 p-1 sm:min-h-28 sm:p-1.5 ${
                  isToday ? "border-gold ring-2 ring-gold/30" : "border-line"
                } ${overIso === iso ? "ring-2 ring-gold" : ""}`}
              >
                <button
                  type="button"
                  className={`self-start rounded px-1 font-display text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
                    isToday ? "text-gold" : "text-ink"
                  }`}
                  aria-label={`Add a post on ${formatLongDate(iso)}`}
                  onClick={() => openCreate(iso)}
                >
                  {Number(iso.slice(8))}
                </button>
                {dayPosts.map((post) => {
                  const position = rangePosition(post.starts_on, post.ends_on, iso);
                  const rangeNote =
                    position && position.total > 1 ? ` · ${position.day}/${position.total}` : "";
                  return (
                    <button
                      key={post.id}
                      type="button"
                      draggable={!moving}
                      onDragStart={(event) => {
                        const payload: DragPayload = { id: post.id, fromIso: iso };
                        event.dataTransfer.setData("text/plain", JSON.stringify(payload));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setOverIso(null)}
                      onClick={() => setEditor({ post, startsOn: post.starts_on })}
                      title={post.title}
                      aria-label={`${post.format}: ${post.title}. ${STATUS_LABELS[post.status]}${
                        position && position.total > 1
                          ? `, day ${position.day} of ${position.total}`
                          : ""
                      }.`}
                      className={`cursor-grab rounded-md px-1.5 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink active:cursor-grabbing ${statusClass(post.status)}`}
                    >
                      <span className="hidden truncate text-[10px] font-medium uppercase tracking-wide opacity-80 sm:block">
                        {post.format}
                        {rangeNote}
                      </span>
                      <span className="block truncate text-[11px] font-semibold sm:text-xs">
                        {position && position.total > 1 ? (
                          <span className="sm:hidden">{position.day}/{position.total} </span>
                        ) : null}
                        {post.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {editor ? (
        <PostEditor
          key={`${editor.post?.id ?? "new"}-${editor.startsOn}`}
          clientId={clientId}
          clientName={clientName}
          slug={slug}
          post={editor.post}
          startsOn={editor.startsOn}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  );
}

let todaySnapshot = "";

function subscribeToToday(onChange: () => void) {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const timer = window.setTimeout(onChange, nextMidnight.getTime() - now.getTime() + 1000);
  return () => window.clearTimeout(timer);
}

function emptyToday() {
  return "";
}

function readTodayIso() {
  const iso = toIsoDate(new Date());
  if (iso !== todaySnapshot) todaySnapshot = iso;
  return todaySnapshot;
}

function readDragPayload(raw: string): DragPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<DragPayload>;
    if (!value || typeof value.id !== "string" || typeof value.fromIso !== "string") return null;
    return { id: value.id, fromIso: value.fromIso };
  } catch {
    return null;
  }
}
