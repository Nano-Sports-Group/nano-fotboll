import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn } from "./hockey-squad-age";

test("ålder räknas på dagens datum, inte bara på årtalet", () => {
  assert.equal(ageOn("1999-06-02", "2026-10-06"), 27);
  assert.equal(ageOn("1999-10-07", "2026-10-06"), 26);
  assert.equal(ageOn("1999-10-06", "2026-10-06"), 27);
});

test("saknat eller orimligt födelsedatum ger ingen ålder", () => {
  assert.equal(ageOn(null, "2026-10-06"), null);
  assert.equal(ageOn("okänt", "2026-10-06"), null);
  // Sportradar lägger ibland 1 januari med fel år; en "ålder" över 60 visas inte.
  assert.equal(ageOn("1900-06-01", "2026-10-06"), null);
  // 1 januari är källans platshållare när bara året är känt.
  assert.equal(ageOn("2000-01-01", "2026-10-06"), null);
  assert.equal(ageOn("2011-03-04", "2026-10-06"), null);
});
