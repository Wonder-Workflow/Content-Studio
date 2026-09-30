import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND_TAGLINE_MAX,
  brandFromRow,
  emptyBrand,
  isBlankBrand,
  readBrandFields,
} from "./brand.ts";

test("brandFromRow keeps the brand fields and drops anything else", () => {
  assert.deepEqual(
    brandFromRow({
      identity: {
        name: "  Harbor   & Co.  ",
        tagline: "Quiet weeks",
        positioning: "  A small lodge\r\nfor slow trips  ",
        logo: "ignore",
      },
      audience: " Couples ",
      offers: "Cabins\r\nDinner",
      voice: {
        tone: "Warm,  specific",
        caption_pattern: " Open on a detail ",
        hashtags: "#no",
      },
      do: "Use real names",
      dont: "No hype",
      visual_notes: "Evening light",
      phrases: "Come stay",
      notes: "leave this out",
      colors: ["#fff"],
    }),
    {
      identity: {
        name: "Harbor & Co.",
        tagline: "Quiet weeks",
        positioning: "A small lodge\nfor slow trips",
      },
      audience: "Couples",
      offers: "Cabins\nDinner",
      voice: {
        tone: "Warm, specific",
        caption_pattern: "Open on a detail",
      },
      do: "Use real names",
      dont: "No hype",
      visual_notes: "Evening light",
      phrases: "Come stay",
    },
  );
});

test("brandFromRow treats missing and non-text values as empty", () => {
  assert.deepEqual(brandFromRow(null), emptyBrand());
  assert.deepEqual(brandFromRow({}), emptyBrand());
  assert.deepEqual(brandFromRow([]), emptyBrand());
  assert.equal(isBlankBrand(brandFromRow({})), true);
  assert.deepEqual(brandFromRow('{"audience":"From a string"}'), {
    ...emptyBrand(),
    audience: "From a string",
  });
  assert.deepEqual(
    brandFromRow({
      identity: ["name"],
      audience: 12,
      offers: { cabins: true },
      voice: "warm",
      do: null,
      phrases: ["Come stay"],
    }),
    emptyBrand(),
  );
  assert.deepEqual(brandFromRow({ identity: { name: "Harbor" } }).identity, {
    name: "Harbor",
    tagline: "",
    positioning: "",
  });
});

test("readBrandFields trims text and writes only the brand keys", () => {
  const form = new FormData();
  form.set("clientId", "do not store");
  form.set("brandName", "  Harbor   & Co. ");
  form.set("tagline", " Quiet weeks ");
  form.set("positioning", " A small lodge ");
  form.set("audience", " Couples ");
  form.set("offers", " Cabins\r\nDinner ");
  form.set("tone", " Warm,  specific ");
  form.set("captionPattern", " Open on a detail ");
  form.set("dos", " Use real names ");
  form.set("donts", " No hype ");
  form.set("visualNotes", " Evening light ");
  form.set("phrases", " Come stay ");
  form.set("notes", "do not store");

  const result = readBrandFields(form);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(Object.keys(result.brand).sort(), [
    "audience",
    "do",
    "dont",
    "identity",
    "offers",
    "phrases",
    "visual_notes",
    "voice",
  ]);
  assert.deepEqual(Object.keys(result.brand.identity).sort(), [
    "name",
    "positioning",
    "tagline",
  ]);
  assert.deepEqual(Object.keys(result.brand.voice).sort(), ["caption_pattern", "tone"]);
  assert.equal(result.brand.identity.name, "Harbor & Co.");
  assert.equal(result.brand.offers, "Cabins\nDinner");
  assert.equal(result.brand.voice.tone, "Warm, specific");
  assert.equal("notes" in result.brand, false);
  assert.equal("clientId" in result.brand, false);
  assert.equal(isBlankBrand(result.brand), false);
  assert.equal(result.brand.colors, undefined);
});

test("readBrandFields accepts an empty form as an empty profile", () => {
  const result = readBrandFields(new FormData());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.brand, emptyBrand());
  assert.equal(isBlankBrand(result.brand), true);
});

test("brandFromRow keeps valid hex colors and drops bad ones", () => {
  assert.deepEqual(
    brandFromRow({
      colors: {
        primary: "#AbC",
        secondary: "blue",
        accent: "#112233",
        background: "#gg0000",
        text: "  #010203  ",
        extra: "#ffffff",
      },
    }),
    {
      ...emptyBrand(),
      colors: {
        primary: "#aabbcc",
        accent: "#112233",
        text: "#010203",
      },
    },
  );
  assert.equal(isBlankBrand(brandFromRow({ colors: { primary: "#112233" } })), false);
  assert.equal(brandFromRow({ colors: ["#fff"] }).colors, undefined);
});

test("readBrandFields stores hex colors and rejects a bad swatch", () => {
  const form = new FormData();
  form.set("colorPrimary", " #abc ");
  form.set("colorText", "#010203");
  const saved = readBrandFields(form);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.deepEqual(saved.brand.colors, { primary: "#aabbcc", text: "#010203" });

  const bad = new FormData();
  bad.set("colorAccent", "navy");
  const rejected = readBrandFields(bad);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.match(rejected.error, /Accent color/);
});

test("readBrandFields rejects a tagline past the limit", () => {
  const form = new FormData();
  form.set("tagline", "x".repeat(BRAND_TAGLINE_MAX + 1));
  const result = readBrandFields(form);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Tagline/);
});
