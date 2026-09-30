"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  createBrandJob,
  getLatestBrandJob,
  refreshBrand,
  type BrandPullState,
} from "@/app/(app)/brand-actions";
import { buttonClass, dangerButtonClass, inputClass, quietButtonClass } from "@/components/styles";
import { brandJobStatusDetail, type BrandJob, type BrandJobSnapshot } from "@/lib/brand-job";

const initialPullState: BrandPullState = { error: null, message: null, job: null };

function isOpen(job: BrandJob | null) {
  return job?.status === "queued" || job?.status === "processing";
}

function statusRank(status: BrandJob["status"]) {
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

/** Prefer a newer job, then a later status on the same job. */
function preferJob(current: BrandJob | null, next: BrandJob | null): BrandJob | null {
  if (!next) return current;
  if (!current) return next;
  if (next.id !== current.id) {
    return next.createdAt >= current.createdAt ? next : current;
  }
  if (statusRank(next.status) !== statusRank(current.status)) {
    return statusRank(next.status) > statusRank(current.status) ? next : current;
  }
  return (next.updatedAt || next.createdAt) >= (current.updatedAt || current.createdAt) ? next : current;
}

export function BrandPullPanel({
  clientId,
  snapshot,
  loadError,
}: {
  clientId: string;
  snapshot: BrandJobSnapshot;
  loadError: string | null;
}) {
  const [polled, setPolled] = useState<BrandJob | null>(null);
  const [state, action, pending] = useActionState(createBrandJob, initialPullState);
  const [refreshing, setRefreshing] = useState(false);
  const refreshedJobId = useRef<string | null>(null);

  const latest = preferJob(preferJob(snapshot.latest, state.job), polled);
  const hasCompleted = snapshot.hasCompleted || latest?.status === "done";
  const inFlight = isOpen(latest);
  const watchedId = latest?.id ?? null;

  useEffect(() => {
    if (!inFlight || !watchedId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      startTransition(async () => {
        const next = await getLatestBrandJob(clientId);
        if (cancelled || !next.ok || !next.snapshot.latest) return;
        const row = next.snapshot.latest;
        setPolled(row);
        if (row.status === "done" && refreshedJobId.current !== row.id) {
          refreshedJobId.current = row.id;
          await refreshBrand(clientId);
        }
      });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [clientId, inFlight, watchedId]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshBrand(clientId);
    } finally {
      setRefreshing(false);
    }
  }

  const statusError = latest?.status === "failed" ? latest.error : null;
  const extraError = state.error && state.error !== statusError ? state.error : null;

  return (
    <section className="max-w-2xl border-b border-line pb-8">
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">From links</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">Pull brand from links</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        Paste the website and social links. The brand bot reads them and fills the notes
        below. You still edit those notes and choose Save brand. One completed pull is kept
        until you regenerate.
      </p>

      {loadError ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {loadError}
        </p>
      ) : (
        <form action={action} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="clientId" value={clientId} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Website</span>
            <input
              className={inputClass}
              name="websiteUrl"
              defaultValue={snapshot.latest?.websiteUrl ?? ""}
              placeholder="https://harbor.example"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Social links</span>
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              name="socialUrls"
              rows={4}
              defaultValue={snapshot.latest?.socialUrls.join("\n") ?? ""}
              placeholder={"https://www.instagram.com/harbor\nhttps://www.tiktok.com/@harbor"}
              spellCheck={false}
            />
            <span className="text-muted">One link per line. Optional.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Notes for the bot</span>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={snapshot.latest?.notes ?? ""}
              placeholder="Optional. A fact to keep, or something to leave out."
            />
          </label>

          {latest ? (
            <p role="status" className="text-sm leading-6 text-ink-soft">
              {brandJobStatusDetail(latest.status)}
              {statusError ? <span className="text-danger"> {statusError}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-muted">No pull yet.</p>
          )}

          {extraError ? (
            <p role="alert" className="text-sm text-danger">
              {extraError}
            </p>
          ) : null}
          {state.message && state.message !== (latest ? brandJobStatusDetail(latest.status) : "") ? (
            <p role="status" className="text-sm text-ink-soft">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {hasCompleted ? (
              <button
                className={dangerButtonClass}
                type="submit"
                name="intent"
                value="regenerate"
                disabled={pending || inFlight}
              >
                {pending ? "Starting…" : "Regenerate"}
              </button>
            ) : (
              <button
                className={buttonClass}
                type="submit"
                name="intent"
                value="pull"
                disabled={pending || inFlight}
              >
                {pending ? "Starting…" : "Pull brand from links"}
              </button>
            )}
            {latest?.status === "done" ? (
              <button
                className={quietButtonClass}
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "Refresh brand"}
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
