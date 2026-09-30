import test from "node:test";
import assert from "node:assert/strict";
import { UiMessagesSchema, toChatTurns } from "./ui-messages";

test("useChat-formatet (parts) valideras och blir modellens turer", () => {
  const parsed = UiMessagesSchema.parse([
    { id: "1", role: "user", parts: [{ type: "text", text: "Hur går det för AIK?" }] },
    {
      id: "2",
      role: "assistant",
      parts: [{ type: "tool-getStandings", state: "output-available" }, { type: "text", text: "AIK är fyra." }],
    },
    { id: "3", role: "user", parts: [{ type: "text", text: "  Och Hammarby?  " }] },
  ]);
  assert.deepEqual(toChatTurns(parsed), [
    { role: "user", content: "Hur går det för AIK?" },
    { role: "assistant", content: "AIK är fyra." },
    { role: "user", content: "Och Hammarby?" },
  ]);
});

test("det gamla {role, content}-formatet avvisas inte tyst — det saknar parts", () => {
  assert.equal(UiMessagesSchema.safeParse([{ role: "user", content: "hej" }]).success, false);
});

test("inget att svara på när sista turen inte är användarens", () => {
  const parsed = UiMessagesSchema.parse([{ role: "assistant", parts: [{ type: "text", text: "Hej" }] }]);
  assert.equal(toChatTurns(parsed), null);
});

test("varje tur kapas till 4 000 tecken", () => {
  const parsed = UiMessagesSchema.parse([{ role: "user", parts: [{ type: "text", text: "x".repeat(5000) }] }]);
  assert.equal(toChatTurns(parsed)?.[0].content.length, 4000);
});
