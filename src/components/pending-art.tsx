"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptPendingArt, discardPendingArt } from "@/app/(app)/batch-actions";
import { buttonClass, quietButtonClass } from "@/components/styles";

export function PendingArt({
  clientId,
  postId,
  jobId,
  previews,
}: {
  clientId: string;
  postId: string;
  jobId: string;
  previews: { id: string; url: string | null }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: "accept" | "discard") {
    setError(null);
    start(async () => {
      const result =
        action === "accept"
          ? await acceptPendingArt(clientId, postId, jobId)
          : await discardPendingArt(clientId, postId, jobId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper-2 p-4">
      <h3 className="font-display text-xl tracking-tight">New images are ready</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        These are from the latest revision. The images on the pack stay until you use these or
        keep the current set.
      </p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {previews.map((item, index) => (
          <li key={item.id} className="w-28">
            {item.url ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-md border border-line">
                <Image
                  src={item.url}
                  alt={`New image ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="112px"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">
                Preview unavailable
              </div>
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={buttonClass} type="button" disabled={pending} onClick={() => run("accept")}>
          {pending ? "Saving…" : "Use these images"}
        </button>
        <button
          className={quietButtonClass}
          type="button"
          disabled={pending}
          onClick={() => run("discard")}
        >
          Keep current images
        </button>
      </div>
    </section>
  );
}
