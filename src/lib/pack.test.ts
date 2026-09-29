import assert from "node:assert/strict";
import test from "node:test";
import { CTA_MAX, packFromRow, readPackFields } from "./pack.ts";

test("packFromRow keeps the pack fields and drops anything else", () => {
  assert.deepEqual(
    packFromRow({
      shot_list_and_angles: "  wide\r\nclose  ",
      caption: "Hello",
      cta: "Book a call",
      notes: "leave this out",
      hook_b: "second hook",
      text_card: "card",
      end_card: "end",
    }),
    {
      shot_list_and_angles: "wide\nclose",
      caption: "Hello",
      cta: "Book a call",
    },
  );
});

test("packFromRow treats missing and non-text values as empty", () => {
  assert.deepEqual(packFromRow(null), {
    shot_list_and_angles: "",
    caption: "",
    cta: "",
  });
  assert.deepEqual(packFromRow([]), {
    shot_list_and_angles: "",
    caption: "",
    cta: "",
  });
  assert.deepEqual(packFromRow('{"caption":"From a string"}'), {
    shot_list_and_angles: "",
    caption: "From a string",
    cta: "",
  });
  assert.deepEqual(packFromRow({ caption: 12, cta: ["tap"] }), {
    shot_list_and_angles: "",
    caption: "",
    cta: "",
  });
});

test("readPackFields trims text and writes only the pack keys", () => {
  const form = new FormData();
  form.set("shotListAndAngles", "  setup, then a close angle  ");
  form.set("caption", " The caption ");
  form.set("cta", " Tap the link ");
  form.set("notes", "do not store");
  const result = readPackFields(form);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(Object.keys(result.pack).sort(), ["caption", "cta", "shot_list_and_angles"]);
  assert.equal(result.pack.shot_list_and_angles, "setup, then a close angle");
  assert.equal(result.pack.caption, "The caption");
  assert.equal(result.pack.cta, "Tap the link");
  assert.equal("notes" in result.pack, false);
});

test("readPackFields rejects a call to action past the limit", () => {
  const form = new FormData();
  form.set("shotListAndAngles", "");
  form.set("caption", "");
  form.set("cta", "x".repeat(CTA_MAX + 1));
  const result = readPackFields(form);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Call to action/);
});
