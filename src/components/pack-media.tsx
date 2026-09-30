"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  removePostImage,
  reorderCarouselImages,
  uploadPostImage,
} from "@/app/(app)/media-actions";
import { MAX_CAROUSEL_IMAGES, slotsForFormat, type PostMediaKind } from "@/lib/media";
import type { PostFormat } from "@/lib/posts";
import { quietButtonClass } from "@/components/styles";

export type PackMediaItem = {
  id: string;
  kind: PostMediaKind;
  position: number;
  previewUrl: string | null;
};

const accept = "image/png,image/jpeg,image/webp";

function byPosition(a: PackMediaItem, b: PackMediaItem) {
  return a.position - b.position || a.id.localeCompare(b.id);
}

export function PackMedia({
  clientId,
  postId,
  format,
  media,
}: {
  clientId: string;
  postId: string;
  format: PostFormat;
  media: PackMediaItem[];
}) {
  const router = useRouter();
  const slots = slotsForFormat(format);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [inputKey, setInputKey] = useState(0);

  const carousel = media.filter((item) => item.kind === "carousel").sort(byPosition);
  const staticImage = media.filter((item) => item.kind === "static").sort(byPosition)[0] ?? null;
  const cover = media.filter((item) => item.kind === "cover").sort(byPosition)[0] ?? null;
  const hidden = media.filter((item) => {
    if (item.kind === "cover") return false;
    if (slots.images === "carousel") return item.kind === "static";
    if (slots.images === "static") return item.kind === "carousel";
    return true;
  });

  function refresh() {
    setInputKey((value) => value + 1);
    router.refresh();
  }

  function upload(kind: PostMediaKind, file: File | null) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("clientId", clientId);
    form.set("postId", postId);
    form.set("kind", kind);
    form.set("file", file);
    startTransition(async () => {
      const result = await uploadPostImage({ error: null }, form);
      if (result.error) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function remove(mediaId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePostImage({ clientId, postId, mediaId });
      if (result.error) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= carousel.length) return;
    const ordered = carousel.map((item) => item.id);
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(next, 0, moved);
    setError(null);
    startTransition(async () => {
      const result = await reorderCarouselImages({ clientId, postId, orderedIds: ordered });
      if (result.error) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Images</h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          Images save as you add them. Save the pack after you change the type. The CSV uses the
          saved type, the caption, and these images. Video upload is not part of this studio.
        </p>
      </div>

      {slots.images === "carousel" ? (
        <ImageSlot
          label="Carousel images"
          hint={`Up to ${MAX_CAROUSEL_IMAGES}. Order is the order in the CSV.`}
        >
          {carousel.length === 0 ? (
            <p className="text-sm text-muted">No carousel images yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {carousel.map((item, index) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3">
                  <Thumb item={item} alt={`Carousel image ${index + 1}`} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={quietButtonClass}
                      type="button"
                      disabled={pending || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Move up
                    </button>
                    <button
                      className={quietButtonClass}
                      type="button"
                      disabled={pending || index === carousel.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Move down
                    </button>
                    <button
                      className={quietButtonClass}
                      type="button"
                      disabled={pending}
                      onClick={() => remove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {carousel.length < MAX_CAROUSEL_IMAGES ? (
            <FileField
              key={`carousel-${inputKey}`}
              label="Add carousel image"
              disabled={pending}
              onFile={(file) => upload("carousel", file)}
            />
          ) : (
            <p className="text-sm text-muted">This carousel is full at {MAX_CAROUSEL_IMAGES}.</p>
          )}
        </ImageSlot>
      ) : null}

      {slots.images === "static" ? (
        <ImageSlot label="Image" hint="One image for this post or story.">
          <SingleImage
            item={staticImage}
            alt="Post image"
            pending={pending}
            inputKey={`static-${inputKey}`}
            emptyLabel="No image yet."
            addLabel={staticImage ? "Replace image" : "Add image"}
            onFile={(file) => upload("static", file)}
            onRemove={() => staticImage && remove(staticImage.id)}
          />
        </ImageSlot>
      ) : null}

      <ImageSlot
        label="Cover / thumbnail"
        hint="Upload this by hand. It is not taken from a video. Reels use this slot."
      >
        <SingleImage
          item={cover}
          alt="Cover image"
          pending={pending}
          inputKey={`cover-${inputKey}`}
          emptyLabel="No cover yet."
          addLabel={cover ? "Replace cover" : "Add cover"}
          onFile={(file) => upload("cover", file)}
          onRemove={() => cover && remove(cover.id)}
        />
      </ImageSlot>

      {hidden.length > 0 ? (
        <ImageSlot
          label="Saved images not used for this type"
          hint="They stay on the post until you remove them, or switch the type back and save."
        >
          <ul className="flex flex-col gap-3">
            {hidden.sort(byPosition).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3">
                <Thumb item={item} alt={item.kind === "carousel" ? "Carousel image" : "Post image"} />
                <button
                  className={quietButtonClass}
                  type="button"
                  disabled={pending}
                  onClick={() => remove(item.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </ImageSlot>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ImageSlot({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="mt-1 text-sm leading-6 text-muted">{hint}</p>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

function SingleImage({
  item,
  alt,
  pending,
  inputKey,
  emptyLabel,
  addLabel,
  onFile,
  onRemove,
}: {
  item: PackMediaItem | null;
  alt: string;
  pending: boolean;
  inputKey: string;
  emptyLabel: string;
  addLabel: string;
  onFile: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <>
      {item ? (
        <div className="flex flex-wrap items-center gap-3">
          <Thumb item={item} alt={alt} />
          <button className={quietButtonClass} type="button" disabled={pending} onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">{emptyLabel}</p>
      )}
      <FileField key={inputKey} label={addLabel} disabled={pending} onFile={onFile} />
    </>
  );
}

function FileField({
  label,
  disabled,
  onFile,
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-paper-2 file:px-3 file:py-2 file:text-sm file:text-ink"
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          onFile(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function Thumb({ item, alt }: { item: PackMediaItem; alt: string }) {
  if (!item.previewUrl) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-md border border-line bg-paper-2 px-2 text-center text-xs text-muted">
        Preview unavailable
      </div>
    );
  }
  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-md border border-line bg-paper-2">
      <Image src={item.previewUrl} alt={alt} fill className="object-cover" sizes="96px" unoptimized />
    </div>
  );
}
