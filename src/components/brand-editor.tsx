"use client";

import { useActionState } from "react";
import { saveBrand, type BrandFormState } from "@/app/(app)/brand-actions";
import {
  BRAND_AUDIENCE_MAX,
  BRAND_CAPTION_PATTERN_MAX,
  BRAND_DO_MAX,
  BRAND_DONT_MAX,
  BRAND_NAME_MAX,
  BRAND_OFFERS_MAX,
  BRAND_PHRASES_MAX,
  BRAND_POSITIONING_MAX,
  BRAND_TAGLINE_MAX,
  BRAND_TONE_MAX,
  BRAND_VISUAL_MAX,
  isBlankBrand,
  type BrandProfile,
} from "@/lib/brand";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: BrandFormState = { error: null };

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  maxLength,
  rows,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  maxLength: number;
  rows?: number;
}) {
  const fieldClass = rows ? `${inputClass} min-h-28 resize-y` : inputClass;
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {rows ? (
        <textarea
          className={fieldClass}
          name={name}
          rows={rows}
          maxLength={maxLength}
          defaultValue={defaultValue}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={fieldClass}
          name={name}
          maxLength={maxLength}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
        />
      )}
    </label>
  );
}

function ColorField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        {defaultValue ? (
          <span
            aria-hidden
            className="size-7 shrink-0 rounded-md border border-line"
            style={{ backgroundColor: defaultValue }}
          />
        ) : null}
        <input
          className={inputClass}
          name={name}
          maxLength={7}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </span>
    </label>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-5">
      <h3 className="font-display text-xl tracking-tight">{title}</h3>
      <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{hint}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function BrandEditor({
  clientId,
  clientName,
  brand,
}: {
  clientId: string;
  clientName: string;
  brand: BrandProfile;
}) {
  const [state, action, pending] = useActionState(saveBrand, initialState);
  const blank = isBlankBrand(brand);

  return (
    <section>
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">Brand</p>
      <h2 className="mt-2 font-display text-3xl tracking-tight">{clientName}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        The notes writers use while building packs: who this client is, how they sound,
        and what to leave out. Anyone on the studio can edit them.
      </p>
      {blank && !state.message ? (
        <p className="mt-3 text-sm text-muted">No brand notes yet.</p>
      ) : null}

      <form key={JSON.stringify(brand)} action={action} className="mt-8 flex max-w-2xl flex-col gap-6">
        <input type="hidden" name="clientId" value={clientId} />

        <Group
          title="Identity"
          hint={`How the brand should read in a post. The board stays named ${clientName}.`}
        >
          <TextField
            label="Brand name"
            name="brandName"
            maxLength={BRAND_NAME_MAX}
            defaultValue={brand.identity.name}
            placeholder="Harbor & Co."
          />
          <TextField
            label="Tagline"
            name="tagline"
            maxLength={BRAND_TAGLINE_MAX}
            defaultValue={brand.identity.tagline}
            placeholder="Quiet weeks, close to the water"
          />
          <TextField
            label="Positioning"
            name="positioning"
            rows={3}
            maxLength={BRAND_POSITIONING_MAX}
            defaultValue={brand.identity.positioning}
            placeholder="A small lodge for people who want the valley without the resort pace."
          />
        </Group>

        <Group title="Audience" hint="Who the posts are for.">
          <TextField
            label="Who they serve"
            name="audience"
            rows={4}
            maxLength={BRAND_AUDIENCE_MAX}
            defaultValue={brand.audience}
            placeholder="Couples on a first stay, and locals booking a long weekend"
          />
        </Group>

        <Group title="Offers" hint="Stay types or services. One per line.">
          <TextField
            label="Offers and services"
            name="offers"
            rows={5}
            maxLength={BRAND_OFFERS_MAX}
            defaultValue={brand.offers}
            placeholder={"Cabins\nA long table dinner\nWeekday stays in the off-season"}
          />
        </Group>

        <Group title="Voice" hint="Tone words, and how a caption usually goes.">
          <TextField
            label="Tone"
            name="tone"
            maxLength={BRAND_TONE_MAX}
            defaultValue={brand.voice.tone}
            placeholder="Warm, specific, unhurried"
          />
          <TextField
            label="Caption pattern"
            name="captionPattern"
            rows={4}
            maxLength={BRAND_CAPTION_PATTERN_MAX}
            defaultValue={brand.voice.caption_pattern}
            placeholder="Open on a concrete detail. Two short lines. One soft ask. Almost no hashtags."
          />
        </Group>

        <Group title="Do and don't" hint="Short rules for the people writing the pack. One per line.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Do"
              name="dos"
              rows={5}
              maxLength={BRAND_DO_MAX}
              defaultValue={brand.do}
              placeholder={"Use the real place names.\nWrite like someone on the property."}
            />
            <TextField
              label="Don't"
              name="donts"
              rows={5}
              maxLength={BRAND_DONT_MAX}
              defaultValue={brand.dont}
              placeholder={"No countdown language.\nNo “luxury” or “nestled”."}
            />
          </div>
        </Group>

        <Group
          title="Visual notes"
          hint="Light and what belongs in the frame. Describe the logo in words if the writers need it."
        >
          <TextField
            label="Colors and imagery"
            name="visualNotes"
            rows={5}
            maxLength={BRAND_VISUAL_MAX}
            defaultValue={brand.visual_notes}
            placeholder="Warm wood, low evening light, the ridge in the background. Skip harsh flash."
          />
        </Group>

        <Group title="Colors" hint="Optional hex swatches, like #1B3A4B. Leave a field blank to skip it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary" name="colorPrimary" defaultValue={brand.colors?.primary ?? ""} placeholder="#1B3A4B" />
            <ColorField label="Secondary" name="colorSecondary" defaultValue={brand.colors?.secondary ?? ""} placeholder="#C4A574" />
            <ColorField label="Accent" name="colorAccent" defaultValue={brand.colors?.accent ?? ""} placeholder="#8A6232" />
            <ColorField label="Background" name="colorBackground" defaultValue={brand.colors?.background ?? ""} placeholder="#F3EFE6" />
            <ColorField label="Text" name="colorText" defaultValue={brand.colors?.text ?? ""} placeholder="#1A1714" />
          </div>
        </Group>

        <Group
          title="Phrases"
          hint="Soft calls to action and lines that already sound like them. One per line."
        >
          <TextField
            label="Phrases they like"
            name="phrases"
            rows={4}
            maxLength={BRAND_PHRASES_MAX}
            defaultValue={brand.phrases}
            placeholder={"Come stay.\nWe'll leave the light on."}
          />
        </Group>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <div>
            {state.error ? (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            ) : null}
            {state.message ? (
              <p role="status" className="text-sm text-ink-soft">
                {state.message}
              </p>
            ) : null}
          </div>
          <button className={buttonClass} type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save brand"}
          </button>
        </div>
      </form>
    </section>
  );
}
