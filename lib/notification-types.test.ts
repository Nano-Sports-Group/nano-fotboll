import assert from "node:assert/strict";
import test from "node:test";
import { NOTIFICATION_TYPES, isNotificationTypeId, resolveNotificationPrefs } from "./notification-types";

const on = (prefs: ReturnType<typeof resolveNotificationPrefs>, id: string) => prefs.find((p) => p.id === id)?.enabled;

test("förval: allt på utom rykten", () => {
  const prefs = resolveNotificationPrefs({}, "football");
  assert.equal(prefs.length, NOTIFICATION_TYPES.length);
  assert.equal(on(prefs, "rumours"), false);
  assert.equal(on(prefs, "news"), true);
});

test("val gäller per sport och trasig lagring faller tillbaka på förvalen", () => {
  const stored = { hockey: { rumours: true, news: false, okänd: true } };
  assert.equal(on(resolveNotificationPrefs(stored, "hockey"), "rumours"), true);
  assert.equal(on(resolveNotificationPrefs(stored, "hockey"), "news"), false);
  assert.equal(on(resolveNotificationPrefs(stored, "football"), "rumours"), false);
  assert.equal(on(resolveNotificationPrefs({ hockey: "trasigt" }, "hockey"), "news"), true);
  assert.equal(on(resolveNotificationPrefs(null, "hockey"), "daily"), true);
});

test("bara kända typer släpps igenom", () => {
  assert.equal(isNotificationTypeId("rumours"), true);
  assert.equal(isNotificationTypeId("allt"), false);
});
