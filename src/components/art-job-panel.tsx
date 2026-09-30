"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  createArtJob,
  getLatestArtJob,
  refreshArt,
  type ArtJobState,
} from "@/app/(app)/art-actions";
import { buttonClass, inputClass, quietButtonClass } from "@/components/styles";
import {
  ART_JOB_NOTES_MAX,
  ART_JOB_STATUS_LABELS,
  artJobStatusDetail,
  artTarget,
  slotsAreFull,
  type ArtJob,
  type ArtJobSnapshot,
  type ArtJobStatus,
} from "@/lib/art-job";
import type { PostMediaKind } from "@/lib/media";
import type { PostFormat } from "@/lib/posts";

const initialState: ArtJobState = { error: null, message: null, job: null };

function isOpen(job: ArtJob | null) {
  return job?.status === "queued" || job?.status === "processing";
}

function statusRank(status: ArtJobStatus) {
  switch (status) {
    case "queued":
      return 1;
    case "processing":
      return 2;
    case "done":
    case "failed":
      return 3;
  }
}

function preferJob(current: ArtJob | null, next: ArtJob | null): ArtJob | null {
  if (!next) return current;
  if (!current) return next;
  if (next.id !== current.id) {
    return next.createdAt >= current.createdAt ? next : current;
  }
  if (statusRank(next.status) !== statusRank(current.status)) {
    return statusRank(next.status) > statusRank(current.status) ? next : current;
  }
  return (next.updatedAt || next.createdAt) >= (current.updatedAt || current.createdAt)
    ? next
    : current;
}

function chipClass(status: ArtJobStatus) {
  switch (status) {
    case "queued":
      return "border border-line bg-paper-2 text-ink-soft";
    case "processing":
      return "bg-status-creating text-ink";
    case "done":
      return "bg-status-ready text-paper";
    case "failed":
      return "border border-danger/40 bg-paper-2 text-danger";
  }
}

export function ArtJobPanel({
  clientId,
  postId,
  format,
  media,
  snapshot,
  loadError,
}: {
  clientId: string;
  postId: string;
  format: PostFormat;
  media: { kind: PostMediaKind; position: number }[];
  snapshot: ArtJobSnapshot;
  loadError: string | null;
}) {
  const [polled, setPolled] = useState<ArtJob | null>(null);
  const [state, action, pending] = useActionState(createArtJob, initialState);
  const [askReplace, setAskReplace] = useState(false);
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const refreshedJobId = useRef<string | null>(null);

  const target = artTarget(format);
  const positions = media.filter((item) => item.kind === target.kind).map((item) => item.position);
  const full = slotsAreFull(positions, target.count);

  const latest = preferJob(preferJob(snapshot.latest, state.job), polled);
  const inFlight = isOpen(latest);
  const watchedId = latest?.id ?? null;

  useEffect(() => {
    if (!inFlight || !watchedId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      startTransition(async () => {
        const next = await getLatestArtJob(clientId, postId);
        if (cancelled || !next.ok || !next.snapshot.latest) return;
        const row = next.snapshot.latest;
        setPolled(row);
        if (row.status === "done" && refreshedJobId.current !== row.id) {
          refreshedJobId.current = row.id;
          await refreshArt(clientId, postId);
        }
      });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientId, postId, inFlight, watchedId]);

  const statusError = latest?.status === "failed" ? latest.error : null;
  const extraError = state.error && state.error !== statusError ? state.error : null;
  const detail = latest ? artJobStatusDetail(latest.status) : "";

  return (
    <section className="mt-8 max-w-2xl border-b border-line pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl tracking-tight">Images from DOT</h2>
        {latest ? (
          <span className={`inline-flex rounded-full px-3 py-1 text-sm ${chipClass(latest.status)}`}>
            {ART_JOB_STATUS_LABELS[latest.status]}
          </span>
        ) : null}
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        DOT draws the images from the saved brand and this saved pack. Save the pack first if you
        changed the type or the words. Empty slots are filled. Images already there stay unless you
        replace them. Video is not generated.
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {loadError}
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="postId" value={postId} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Notes for DOT</span>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              name="notes"
              rows={2}
              maxLength={ART_JOB_NOTES_MAX}
              defaultValue={snapshot.latest?.notes ?? ""}
              placeholder="Optional. A color to keep, or something to leave out."
            />
          </label>

          {latest ? (
            <p role="status" className="text-sm leading-6 text-ink-soft">
              {detail}
              {statusError ? <span className="text-danger"> {statusError}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-muted">No DOT images yet.</p>
          )}

          {extraError ? (
            <p role="alert" className="text-sm text-danger">
              {extraError}
            </p>
          ) : null}
          {state.message && state.message !== detail ? (
            <p role="status" className="text-sm text-ink-soft">
              {state.message}
            </p>
          ) : null}
          {skipNote ? <p className="text-sm text-ink-soft">{skipNote}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            {full && askReplace ? (
              <>
                <p className="w-full text-sm leading-6 text-ink-soft">
                  Every image slot for this type is full. Replace the images already on this pack, or
                  skip.
                </p>
                <button
                  className={buttonClass}
                  type="submit"
                  name="intent"
                  value="replace"
                  disabled={pending || inFlight}
                >
                  {pending ? "Starting…" : "Replace images"}
                </button>
                <button
                  className={quietButtonClass}
                  type="button"
                  disabled={pending || inFlight}
                  onClick={() => {
                    setAskReplace(false);
                    setSkipNote("Left the current images in place.");
                  }}
                >
                  Skip
                </button>
              </>
            ) : (
              <button
                className={buttonClass}
                type={full ? "button" : "submit"}
                name="intent"
                value="generate"
                disabled={pending || inFlight}
                onClick={() => {
                  if (!full) return;
                  setSkipNote(null);
                  setAskReplace(true);
                }}
              >
                {pending ? "Starting…" : "Generate with DOT"}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
