"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { statusClass } from "@/components/status-chip";
import { quietButtonClass } from "@/components/styles";
import { formatShotSchedule, type ShotRow } from "@/lib/shot-list";
import { clearShotMarks, parseShotMarks, toggleShotMark } from "@/lib/shot-marks";
import { STATUS_LABELS } from "@/lib/posts";

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function storageKey(clientId: string) {
  return `content-studio:shot-list:${clientId}`;
}

function emit(clientId: string) {
  const bucket = listeners.get(clientId);
  if (!bucket) return;
  for (const listener of bucket) listener();
}

function readRaw(clientId: string) {
  if (memory.has(clientId)) return memory.get(clientId) ?? "";
  try {
    return localStorage.getItem(storageKey(clientId)) ?? "";
  } catch {
    return "";
  }
}

function writeRaw(clientId: string, value: string) {
  memory.set(clientId, value);
  try {
    localStorage.setItem(storageKey(clientId), value);
  } catch {
    // The marks still live for this tab when storage is blocked.
  }
  emit(clientId);
}

function subscribe(clientId: string, onStoreChange: () => void) {
  const bucket = listeners.get(clientId) ?? new Set<() => void>();
  listeners.set(clientId, bucket);
  bucket.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(clientId)) return;
    memory.set(clientId, event.newValue ?? "");
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    bucket.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function useShotMarks(clientId: string) {
  const raw = useSyncExternalStore(
    (onStoreChange) => subscribe(clientId, onStoreChange),
    () => readRaw(clientId),
    () => "",
  );
  const marks = new Set(parseShotMarks(raw));

  return {
    marks,
    toggle(id: string) {
      writeRaw(clientId, toggleShotMark(readRaw(clientId), id));
    },
    clear(ids: readonly string[]) {
      writeRaw(clientId, clearShotMarks(readRaw(clientId), ids));
    },
  };
}

function kindLabel(row: ShotRow) {
  return row.platform ? `${row.format} · ${row.platform}` : row.format;
}

export function ShotChecklist({
  clientId,
  slug,
  rows,
}: {
  clientId: string;
  slug: string;
  rows: ShotRow[];
}) {
  const { marks, toggle, clear } = useShotMarks(clientId);
  const anyMarked = rows.some((row) => marks.has(row.id));

  return (
    <div>
      {anyMarked ? (
        <div className="mt-6 flex justify-end print:hidden">
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => clear(rows.map((row) => row.id))}
          >
            Clear filmed
          </button>
        </div>
      ) : null}
      <ol className={`${anyMarked ? "mt-4" : "mt-8"} border-t border-line`}>
        {rows.map((row, index) => {
          const filmed = marks.has(row.id);
          return (
            <li key={row.id} className="border-b border-line py-5">
              <article className="flex gap-4">
                <label className="mt-1 flex shrink-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-gold"
                    checked={filmed}
                    onChange={() => toggle(row.id)}
                  />
                  <span className={filmed ? "font-medium text-ink" : "text-muted"}>Filmed</span>
                  <span className="sr-only">: {row.title}</span>
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <h3 className="font-display text-xl tracking-tight">
                      <span className="mr-2 text-sm text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {row.title}
                    </h3>
                    <span
                      className={`status-chip rounded-full px-2.5 py-1 text-xs ${statusClass(row.status)}`}
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatShotSchedule(row.startsOn, row.endsOn)} · {kindLabel(row)}
                  </p>
                  <p className="mt-4 font-display text-xs uppercase tracking-[0.14em] text-gold">
                    Hook
                  </p>
                  <p
                    className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${
                      row.hook ? "text-ink-soft" : "text-muted"
                    }`}
                  >
                    {row.hook || "No hook yet"}
                  </p>
                  <p className="mt-4 font-display text-xs uppercase tracking-[0.14em] text-gold">
                    Shot list and angles
                  </p>
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${
                      row.shotListAndAngles ? "text-ink-soft" : "text-muted"
                    }`}
                  >
                    {row.shotListAndAngles || "No shot list yet"}
                  </p>
                  <Link
                    href={`/clients/${slug}/packs/${row.id}`}
                    className="mt-3 inline-block text-sm text-gold print:hidden"
                  >
                    Open pack
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
