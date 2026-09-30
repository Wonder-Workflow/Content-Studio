"use client";

import { useActionState } from "react";
import { reviseBatch, type ReviseState } from "@/app/(app)/batch-actions";
import { REVISION_NOTE_MAX } from "@/lib/batch";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: ReviseState = { error: null, message: null };

export function BatchRevise({
  clientId,
  batchId,
  postId,
}: {
  clientId: string;
  batchId: string;
  postId?: string;
}) {
  const [state, action, pending] = useActionState(reviseBatch, initialState);
  const onePack = Boolean(postId);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="batchId" value={batchId} />
      {postId ? <input type="hidden" name="postId" value={postId} /> : null}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{onePack ? "Revise this pack" : "Revise this batch"}</span>
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          name="note"
          required
          maxLength={REVISION_NOTE_MAX}
          placeholder="Change the hook, redo slide 2, warmer tones"
        />
      </label>
      <p className="text-sm leading-6 text-muted">
        {onePack
          ? "Copy updates on this pack. A look or image change queues a new DOT job. Current images stay until you accept the new ones."
          : "The same note is applied to every pack in this batch. A look or image change queues a new DOT job on each one. Current images stay until you accept the new ones."}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-sm text-ink">{state.message}</p> : null}
      <div>
        <button className={buttonClass} type="submit" disabled={pending}>
          {pending ? "Saving…" : onePack ? "Revise pack" : "Revise batch"}
        </button>
      </div>
    </form>
  );
}
