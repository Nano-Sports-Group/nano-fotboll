import test from "node:test";
import assert from "node:assert/strict";
import { extractTextDeltas } from "./ui-stream";

test("plockar textdelta ur UI message stream och ignorerar övrigt", () => {
  const sse =
    'data: {"type":"start"}\n\n' +
    'data: {"type":"tool-input-available","toolName":"getStandings"}\n\n' +
    'data: {"type":"text-delta","id":"t1","delta":"Frölunda "}\n\n' +
    'data: {"type":"text-delta","id":"t1","delta":"leder."}\n\n' +
    "data: [DONE]\n\n";
  const { deltas, rest } = extractTextDeltas(sse);
  assert.deepEqual(deltas, ["Frölunda ", "leder."]);
  assert.equal(rest, "");
});

test("en rad som delats mellan två chunks väntar på resten", () => {
  const first = extractTextDeltas('data: {"type":"text-delta","id":"t","delta":"Hej"}\ndata: {"type":"text-de');
  assert.deepEqual(first.deltas, ["Hej"]);
  const second = extractTextDeltas(first.rest + 'lta","id":"t","delta":" då"}\n');
  assert.deepEqual(second.deltas, [" då"]);
});
