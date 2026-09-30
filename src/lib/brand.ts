/**
 * clients.brand — the only brand profile for a client.
 *
 * Stored shape (all strings; missing keys read as ""):
 *
 *   identity.name            public name for captions (single line, 80)
 *   identity.tagline         line under the name (single line, 160)
 *   identity.positioning     what they are (400)
 *   audience                 who they serve (800)
 *   offers                   stay types or services, one per line (2000)
 *   voice.tone               tone words (single line, 300)
 *   voice.caption_pattern    how captions usually go (2000)
 *   do                       what to do, one line per bullet (2000)
 *   dont                     what to leave out, one line per bullet (2000)
 *   visual_notes             colors and imagery; text only (2000)
 *   phrases                  soft CTAs and lines they like, one per line (800)
 *   colors                   optional hex swatches (primary, secondary, accent,
 *                            background, text). Omitted when every swatch is blank.
 *
 * {} is the column default and reads as an empty profile.
 * A save writes every text key, including empty strings.
 * colors is included only when at least one swatch is a hex color.
 * Lengths match clients_brand_shape in
 * supabase/migrations/20260930120000_clients_brand_shape.sql.
 */

export const BRAND_NAME_MAX = 80;
export const BRAND_TAGLINE_MAX = 160;
export const BRAND_POSITIONING_MAX = 400;
export const BRAND_AUDIENCE_MAX = 800;
export const BRAND_OFFERS_MAX = 2000;
export const BRAND_TONE_MAX = 300;
export const BRAND_CAPTION_PATTERN_MAX = 2000;
export const BRAND_DO_MAX = 2000;
export const BRAND_DONT_MAX = 2000;
export const BRAND_VISUAL_MAX = 2000;
export const BRAND_PHRASES_MAX = 800;

export const BRAND_COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "text",
] as const;

export type BrandColorKey = (typeof BRAND_COLOR_KEYS)[number];

/** Hex colors only. Each key is optional. Missing means no swatch was saved. */
export type BrandColors = Partial<Record<BrandColorKey, string>>;

export type BrandProfile = {
  identity: {
    name: string;
    tagline: string;
    positioning: string;
  };
  audience: string;
  offers: string;
  voice: {
    tone: string;
    caption_pattern: string;
  };
  do: string;
  dont: string;
  visual_notes: string;
  phrases: string;
  colors?: BrandColors;
};

export function emptyBrand(): BrandProfile {
  return {
    identity: { name: "", tagline: "", positioning: "" },
    audience: "",
    offers: "",
    voice: { tone: "", caption_pattern: "" },
    do: "",
    dont: "",
    visual_notes: "",
    phrases: "",
  };
}

export function brandHasColors(colors: BrandColors | undefined): boolean {
  if (!colors) return false;
  return BRAND_COLOR_KEYS.some((key) => Boolean(colors[key]));
}

export function isBlankBrand(brand: BrandProfile): boolean {
  return (
    brand.identity.name === "" &&
    brand.identity.tagline === "" &&
    brand.identity.positioning === "" &&
    brand.audience === "" &&
    brand.offers === "" &&
    brand.voice.tone === "" &&
    brand.voice.caption_pattern === "" &&
    brand.do === "" &&
    brand.dont === "" &&
    brand.visual_notes === "" &&
    brand.phrases === "" &&
    !brandHasColors(brand.colors)
  );
}

/** #RGB or #RRGGBB, stored as lowercase #rrggbb. Anything else is dropped. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return `#${full}`;
}

export function colorsFromRow(value: unknown): BrandColors | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const colors: BrandColors = {};
  for (const key of BRAND_COLOR_KEYS) {
    const hex = normalizeHex(record[key]);
    if (hex) colors[key] = hex;
  }
  return brandHasColors(colors) ? colors : undefined;
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

function asText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function asLine(value: unknown): string {
  return asText(value).replace(/\s+/g, " ").trim();
}

export function brandFromRow(value: unknown): BrandProfile {
  const record = asRecord(value);
  if (!record) return emptyBrand();
  const identity = asRecord(record.identity);
  const voice = asRecord(record.voice);
  const brand: BrandProfile = {
    identity: {
      name: asLine(identity?.name),
      tagline: asLine(identity?.tagline),
      positioning: asText(identity?.positioning),
    },
    audience: asText(record.audience),
    offers: asText(record.offers),
    voice: {
      tone: asLine(voice?.tone),
      caption_pattern: asText(voice?.caption_pattern),
    },
    do: asText(record.do),
    dont: asText(record.dont),
    visual_notes: asText(record.visual_notes),
    phrases: asText(record.phrases),
  };
  const colors = colorsFromRow(record.colors);
  if (colors) brand.colors = colors;
  return brand;
}

function cleanLine(
  value: FormDataEntryValue | null,
  max: number,
  label: string,
): { error: string | null; text: string } {
  const text = asLine(typeof value === "string" ? value : String(value ?? ""));
  if (text.length > max) {
    return { error: `${label} must be ${max} characters or fewer.`, text };
  }
  return { error: null, text };
}

function cleanBlock(
  value: FormDataEntryValue | null,
  max: number,
  label: string,
): { error: string | null; text: string } {
  const text = asText(typeof value === "string" ? value : String(value ?? ""));
  if (text.length > max) {
    return { error: `${label} must be ${max} characters or fewer.`, text };
  }
  return { error: null, text };
}

export function readBrandFields(
  formData: FormData,
): { ok: true; brand: BrandProfile } | { ok: false; error: string } {
  const name = cleanLine(formData.get("brandName"), BRAND_NAME_MAX, "Brand name");
  if (name.error) return { ok: false, error: name.error };

  const tagline = cleanLine(formData.get("tagline"), BRAND_TAGLINE_MAX, "Tagline");
  if (tagline.error) return { ok: false, error: tagline.error };

  const positioning = cleanBlock(
    formData.get("positioning"),
    BRAND_POSITIONING_MAX,
    "Positioning",
  );
  if (positioning.error) return { ok: false, error: positioning.error };

  const audience = cleanBlock(formData.get("audience"), BRAND_AUDIENCE_MAX, "Audience");
  if (audience.error) return { ok: false, error: audience.error };

  const offers = cleanBlock(formData.get("offers"), BRAND_OFFERS_MAX, "Offers");
  if (offers.error) return { ok: false, error: offers.error };

  const tone = cleanLine(formData.get("tone"), BRAND_TONE_MAX, "Tone");
  if (tone.error) return { ok: false, error: tone.error };

  const captionPattern = cleanBlock(
    formData.get("captionPattern"),
    BRAND_CAPTION_PATTERN_MAX,
    "Caption pattern",
  );
  if (captionPattern.error) return { ok: false, error: captionPattern.error };

  const dos = cleanBlock(formData.get("dos"), BRAND_DO_MAX, "Do");
  if (dos.error) return { ok: false, error: dos.error };

  const donts = cleanBlock(formData.get("donts"), BRAND_DONT_MAX, "Don't");
  if (donts.error) return { ok: false, error: donts.error };

  const visualNotes = cleanBlock(
    formData.get("visualNotes"),
    BRAND_VISUAL_MAX,
    "Visual notes",
  );
  if (visualNotes.error) return { ok: false, error: visualNotes.error };

  const phrases = cleanBlock(formData.get("phrases"), BRAND_PHRASES_MAX, "Phrases");
  if (phrases.error) return { ok: false, error: phrases.error };

  const colors = readColorFields(formData);
  if (!colors.ok) return colors;

  const brand: BrandProfile = {
    identity: {
      name: name.text,
      tagline: tagline.text,
      positioning: positioning.text,
    },
    audience: audience.text,
    offers: offers.text,
    voice: {
      tone: tone.text,
      caption_pattern: captionPattern.text,
    },
    do: dos.text,
    dont: donts.text,
    visual_notes: visualNotes.text,
    phrases: phrases.text,
  };
  if (colors.colors) brand.colors = colors.colors;
  return { ok: true, brand };
}

const COLOR_FIELDS: { key: BrandColorKey; form: string; label: string }[] = [
  { key: "primary", form: "colorPrimary", label: "Primary color" },
  { key: "secondary", form: "colorSecondary", label: "Secondary color" },
  { key: "accent", form: "colorAccent", label: "Accent color" },
  { key: "background", form: "colorBackground", label: "Background color" },
  { key: "text", form: "colorText", label: "Text color" },
];

function readColorFields(
  formData: FormData,
): { ok: true; colors?: BrandColors } | { ok: false; error: string } {
  const colors: BrandColors = {};
  for (const field of COLOR_FIELDS) {
    const raw = formData.get(field.form);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) continue;
    const hex = normalizeHex(text);
    if (!hex) {
      return {
        ok: false,
        error: `${field.label} must be a hex color like #1B3A4B.`,
      };
    }
    colors[field.key] = hex;
  }
  if (!brandHasColors(colors)) return { ok: true };
  return { ok: true, colors };
}
