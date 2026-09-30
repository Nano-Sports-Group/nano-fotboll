import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT_WINDOW_DAYS, contentCutoffIso } from "./content-window";

test("fönstret är 60 dagar bakåt från nu", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  assert.equal(CONTENT_WINDOW_DAYS, 60);
  assert.equal(contentCutoffIso(now), "2026-08-01T10:00:00.000Z");
});
