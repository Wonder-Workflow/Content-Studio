"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState, useTransition } from "react";
import { deletePost, savePost, type PostFormState } from "@/app/(app)/post-actions";
import { formatLongDate, MAX_RANGE_DAYS } from "@/lib/calendar";
import {
  CAPTION_MAX,
  CTA_MAX,
  SHOT_LIST_MAX,
} from "@/lib/pack";
import {
  HOOK_MAX,
  PLATFORM_MAX,
  PLATFORM_SUGGESTIONS,
  POST_FORMATS,
  POST_STATUSES,
  STATUS_LABELS,
  TITLE_MAX,
  type Post,
  type PostStatus,
} from "@/lib/posts";
import { statusClass } from "@/components/status-chip";
import { buttonClass, dangerButtonClass, inputClass, quietButtonClass } from "@/components/styles";

const initialState: PostFormState = { error: null };

function scheduleLabel(startsOn: string, endsOn: string | null) {
  if (endsOn && endsOn > startsOn) {
    return `${formatLongDate(startsOn)} – ${formatLongDate(endsOn)}`;
  }
  return formatLongDate(startsOn);
}

export function PackEditor({
  clientId,
  clientName,
  slug,
  post,
}: {
  clientId: string;
  clientName: string;
  slug: string;
  post: Post;
}) {
  const router = useRouter();
  const platformListId = useId();
  const [state, action, pending] = useActionState(savePost, initialState);
  const [status, setStatus] = useState<PostStatus>(post.status);
  const [start, setStart] = useState(post.starts_on);
  const [end, setEnd] = useState(post.ends_on ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  function remove() {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deletePost(post.id, clientId);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      router.push(`/clients/${slug}/packs`);
      router.refresh();
    });
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Pack</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">{post.title}</h2>
          <p className="mt-2 text-sm text-muted">
            {clientName} · {scheduleLabel(post.starts_on, post.ends_on)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={quietButtonClass} href={`/clients/${slug}/packs`}>
            All packs
          </Link>
          <Link
            className={quietButtonClass}
            href={`/clients/${slug}?month=${post.starts_on.slice(0, 7)}`}
          >
            Calendar
          </Link>
        </div>
      </div>

      <form action={action} className="mt-8 flex max-w-2xl flex-col gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="postId" value={post.id} />
        <input type="hidden" name="includePack" value="1" />
        <input type="hidden" name="returnTo" value="pack" />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Title</span>
          <input
            className={inputClass}
            name="title"
            required
            maxLength={TITLE_MAX}
            defaultValue={post.title}
            placeholder="What this post is about"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Hook</span>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            name="hook"
            maxLength={HOOK_MAX}
            defaultValue={post.hook}
            placeholder="The first line someone hears or reads"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Type</span>
            <select className={inputClass} name="format" defaultValue={post.format}>
              {POST_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Platform</span>
            <input
              className={inputClass}
              name="platform"
              list={platformListId}
              maxLength={PLATFORM_MAX}
              defaultValue={post.platform}
              placeholder="Instagram"
            />
            <datalist id={platformListId}>
              {PLATFORM_SUGGESTIONS.map((platform) => (
                <option key={platform} value={platform} />
              ))}
            </datalist>
          </label>
        </div>

        <fieldset className="min-w-0 border-0 p-0">
          <legend className="text-sm font-medium">Status</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {POST_STATUSES.map((option) => {
              const selected = status === option;
              return (
                <label
                  key={option}
                  className={`cursor-pointer rounded-full px-3 py-1 text-sm ${
                    selected ? statusClass(option) : "border border-line bg-paper-2 text-ink-soft"
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="status"
                    value={option}
                    checked={selected}
                    onChange={() => setStatus(option)}
                  />
                  {STATUS_LABELS[option]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Start date</span>
            <input
              className={inputClass}
              type="date"
              name="startsOn"
              required
              value={start}
              onChange={(event) => {
                const next = event.target.value;
                setStart(next);
                if (end && next && end < next) setEnd("");
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">End date</span>
            <input
              className={inputClass}
              type="date"
              name="endsOn"
              min={start}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <p className="text-sm leading-6 text-muted">
          Leave the end date blank for one day. A range shows on every day it covers, up to{" "}
          {MAX_RANGE_DAYS} days.
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Shot list and angles</span>
          <textarea
            className={`${inputClass} min-h-32 resize-y`}
            name="shotListAndAngles"
            maxLength={SHOT_LIST_MAX}
            defaultValue={post.pack.shot_list_and_angles}
            placeholder="The shots and angles for this post"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Caption</span>
          <textarea
            className={`${inputClass} min-h-28 resize-y`}
            name="caption"
            maxLength={CAPTION_MAX}
            defaultValue={post.pack.caption}
            placeholder="The caption that goes with the post"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Call to action</span>
          <input
            className={inputClass}
            name="cta"
            maxLength={CTA_MAX}
            defaultValue={post.pack.cta}
            placeholder="What you want them to do next"
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {deleteError ? (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {confirmingDelete ? (
            <button
              className={dangerButtonClass}
              type="button"
              disabled={pending || deleting}
              onClick={remove}
            >
              {deleting ? "Removing…" : "Remove this post"}
            </button>
          ) : (
            <button
              className={dangerButtonClass}
              type="button"
              disabled={pending || deleting}
              onClick={() => setConfirmingDelete(true)}
            >
              Remove from calendar
            </button>
          )}
          <button className={buttonClass} type="submit" disabled={pending || deleting}>
            {pending ? "Saving…" : "Save pack"}
          </button>
        </div>
      </form>
    </section>
  );
}
