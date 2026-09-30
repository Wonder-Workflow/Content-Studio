"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createBatch, type BatchFormState } from "@/app/(app)/batch-actions";
import {
  BATCH_WINDOWS,
  DEFAULT_BATCH_MIX,
  MIX_PER_TYPE_MAX,
  REFERENCE_IMAGE_MAX,
  REFERENCE_URL_MAX,
  STYLE_NOTE_MAX,
  type BatchWindow,
} from "@/lib/batch";
import { toIsoDate } from "@/lib/calendar";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: BatchFormState = { error: null };

const windowLabels: Record<BatchWindow, string> = {
  "1-week": "1 week",
  "2-weeks": "2 weeks",
  "1-month": "1 month",
  custom: "Custom dates",
};

function subscribe() {
  return () => {};
}

export function BatchForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createBatch, initialState);
  const [preset, setPreset] = useState<BatchWindow>("1-week");
  const today = useSyncExternalStore(subscribe, () => toIsoDate(new Date()), () => "");

  return (
    <form action={action} className="mt-8 flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="today" value={today} />

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="text-sm font-medium">Window</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {BATCH_WINDOWS.map((option) => {
            const selected = preset === option;
            return (
              <label
                key={option}
                className={`cursor-pointer rounded-full px-3 py-1 text-sm ${
                  selected
                    ? "bg-ink text-paper"
                    : "border border-line bg-paper-2 text-ink-soft"
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="window"
                  value={option}
                  checked={selected}
                  onChange={() => setPreset(option)}
                />
                {windowLabels[option]}
              </label>
            );
          })}
        </div>
        {preset === "custom" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Start</span>
              <input className={inputClass} type="date" name="startsOn" required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">End</span>
              <input className={inputClass} type="date" name="endsOn" required />
            </label>
          </div>
        ) : (
          <>
            <input type="hidden" name="startsOn" value="" />
            <input type="hidden" name="endsOn" value="" />
          </>
        )}
        <p className="mt-2 text-sm leading-6 text-muted">
          One week, two weeks, and one month start today. A custom range can be up to 62 days.
        </p>
      </fieldset>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="text-sm font-medium">Mix per week</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Carousels</span>
            <input
              className={inputClass}
              type="number"
              name="carouselCount"
              min={0}
              max={MIX_PER_TYPE_MAX}
              step={1}
              required
              defaultValue={DEFAULT_BATCH_MIX.Carousel}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Static posts</span>
            <input
              className={inputClass}
              type="number"
              name="staticCount"
              min={0}
              max={MIX_PER_TYPE_MAX}
              step={1}
              required
              defaultValue={DEFAULT_BATCH_MIX.Post}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span>Reel covers</span>
            <input
              className={inputClass}
              type="number"
              name="reelCount"
              min={0}
              max={MIX_PER_TYPE_MAX}
              step={1}
              required
              defaultValue={DEFAULT_BATCH_MIX.Reel}
            />
          </label>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          These counts repeat each week. A short leftover week is scaled down. Static posts are
          the Post type. Reel covers use the reel cover slot.
        </p>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Look and structure</span>
        <textarea
          className={`${inputClass} min-h-28 resize-y`}
          name="styleNote"
          maxLength={STYLE_NOTE_MAX}
          placeholder="Airy carousels, warm stone, short hooks. Copy the pace of their current feed."
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Reference links</span>
        <textarea
          className={`${inputClass} min-h-20 resize-y`}
          name="referenceUrls"
          placeholder={"https://www.instagram.com/p/…\nOne https link per line"}
        />
        <span className="text-muted">Optional. Up to {REFERENCE_URL_MAX} links.</span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Reference images</span>
        <input
          className="text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:text-paper"
          type="file"
          name="references"
          accept="image/png,image/jpeg,image/webp"
          multiple
        />
        <span className="text-muted">
          Optional. Up to {REFERENCE_IMAGE_MAX} PNG, JPEG, or WebP images, 10MB each. These mean
          “copy this carousel or static style.”
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div>
        <button className={buttonClass} type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate batch"}
        </button>
        <p className="mt-2 text-sm leading-6 text-muted">
          This writes draft packs on the calendar and queues a DOT image job for each one. It does
          not call an image model from this app.
        </p>
      </div>
    </form>
  );
}
