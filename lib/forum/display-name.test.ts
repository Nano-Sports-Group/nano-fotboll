import { test } from "node:test";
import assert from "node:assert/strict";
import { FORUM_NAME_PATTERN, forumDisplayName } from "./display-name";

test("forumnamnet går först, sedan förnamnet — aldrig hela namnet", () => {
  assert.equal(forumDisplayName("Bajen_72", "Hampus"), "Bajen_72");
  assert.equal(forumDisplayName(null, "Hampus"), "Hampus");
  assert.equal(forumDisplayName("  ", " Hampus "), "Hampus");
  assert.equal(forumDisplayName(undefined, null), "Supporter");
});

test("samma regel som /api/profile", () => {
  assert.ok(FORUM_NAME_PATTERN.test("Bajen_72"));
  assert.ok(!FORUM_NAME_PATTERN.test("ab"));
  assert.ok(!FORUM_NAME_PATTERN.test("med mellanslag"));
  assert.ok(!FORUM_NAME_PATTERN.test("åäö_123"));
});
