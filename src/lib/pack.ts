export const SHOT_LIST_MAX = 4000;
export const CAPTION_MAX = 2200;
export const CTA_MAX = 300;

/** Text stored in posts.pack. The single hook stays on the post row. */
export type PackBody = {
  shot_list_and_angles: string;
  caption: string;
  cta: string;
};

export function emptyPack(): PackBody {
  return { shot_list_and_angles: "", caption: "", cta: "" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  let current = value;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof current === "object" && current !== null && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  return null;
}

function asPackText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

export function packFromRow(value: unknown): PackBody {
  const record = asRecord(value);
  if (!record) return emptyPack();
  return {
    shot_list_and_angles: asPackText(record.shot_list_and_angles),
    caption: asPackText(record.caption),
    cta: asPackText(record.cta),
  };
}

function cleanBlock(
  value: FormDataEntryValue | null,
  max: number,
  label: string,
): { error: string | null; text: string } {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length > max) {
    return { error: `${label} must be ${max} characters or fewer.`, text };
  }
  return { error: null, text };
}

export function readPackFields(
  formData: FormData,
): { ok: true; pack: PackBody } | { ok: false; error: string } {
  const shotList = cleanBlock(
    formData.get("shotListAndAngles"),
    SHOT_LIST_MAX,
    "Shot list and angles",
  );
  if (shotList.error) return { ok: false, error: shotList.error };

  const caption = cleanBlock(formData.get("caption"), CAPTION_MAX, "Caption");
  if (caption.error) return { ok: false, error: caption.error };

  const cta = cleanBlock(formData.get("cta"), CTA_MAX, "Call to action");
  if (cta.error) return { ok: false, error: cta.error };

  return {
    ok: true,
    pack: {
      shot_list_and_angles: shotList.text,
      caption: caption.text,
      cta: cta.text,
    },
  };
}
