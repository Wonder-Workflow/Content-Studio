"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { deletePost, savePost, type PostFormState } from "@/app/(app)/post-actions";
import { formatLongDate, MAX_RANGE_DAYS } from "@/lib/calendar";
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
import { buttonClass, dangerButtonClass, inputClass, quietButtonClass } from "@/components/styles";
import { statusClass } from "@/components/status-chip";

const initialState: PostFormState = { error: null };

type PostEditorProps = {
  clientId: string;
  clientName: string;
  post: Post | null;
  startsOn: string;
  onClose: () => void;
};

export function PostEditor({
  clientId,
  clientName,
  post,
  startsOn,
  onClose,
}: PostEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreClose = useRef(false);
  const titleId = useId();
  const platformListId = useId();
  const [state, action, pending] = useActionState(savePost, initialState);
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "idea");
  const [start, setStart] = useState(post?.starts_on ?? startsOn);
  const [end, setEnd] = useState(post?.ends_on ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      // Strict mode unmounts the dialog while it is still open. Closing it
      // there must not tell the parent to dismiss the editor.
      ignoreClose.current = true;
      if (dialog.open) dialog.close();
    };
  }, []);

  function handleDialogClose() {
    if (ignoreClose.current) {
      ignoreClose.current = false;
      return;
    }
    onClose();
  }

  const rangeLabel =
    end && end > start ? `${formatLongDate(start)} – ${formatLongDate(end)}` : formatLongDate(start);

  function requestClose() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    onClose();
  }

  function remove() {
    if (!post) return;
    setDeleteError(null);
    startDelete(async () => {
      const result = await deletePost(post.id, clientId);
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      requestClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="calendar-dialog"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      onCancel={(event) => {
        if (pending || deleting) event.preventDefault();
      }}
      onMouseDown={(event) => {
        if (pending || deleting) return;
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form action={action} className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">
            {clientName}
          </p>
          <h2 id={titleId} className="mt-2 font-display text-2xl tracking-tight">
            {post ? "Edit post" : "New post"}
          </h2>
          <p className="mt-1 text-sm text-muted">{rangeLabel}</p>
        </div>

        <input type="hidden" name="clientId" value={clientId} />
        {post ? <input type="hidden" name="postId" value={post.id} /> : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Title</span>
          <input
            className={inputClass}
            name="title"
            required
            maxLength={TITLE_MAX}
            defaultValue={post?.title ?? ""}
            placeholder="What this post is about"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Hook</span>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            name="hook"
            maxLength={HOOK_MAX}
            defaultValue={post?.hook ?? ""}
            placeholder="The first line someone hears or reads"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Type</span>
            <select
              className={inputClass}
              name="format"
              defaultValue={post?.format ?? "Reel"}
            >
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
              defaultValue={post?.platform ?? ""}
              placeholder="Instagram"
            />
            <datalist id={platformListId}>
              {PLATFORM_SUGGESTIONS.map((platform) => (
                <option key={platform} value={platform} />
              ))}
            </datalist>
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Status</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {POST_STATUSES.map((option) => {
              const selected = status === option;
              return (
                <label
                  key={option}
                  className={`cursor-pointer rounded-full px-3 py-1 text-sm ${
                    selected
                      ? statusClass(option)
                      : "border border-line bg-paper-2 text-ink-soft"
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
          Leave the end date blank for one day. A range shows on every day it covers,
          up to {MAX_RANGE_DAYS} days.
        </p>

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
          {post ? (
            confirmingDelete ? (
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
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              className={quietButtonClass}
              type="button"
              disabled={pending || deleting}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button className={buttonClass} type="submit" disabled={pending || deleting}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
