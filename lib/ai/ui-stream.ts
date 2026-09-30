/**
 * Läser AI SDK:s UI message stream (SSE: `data: {json}\n\n`) utan useChat —
 * för /ai som renderar sin egen chatt. Bara textdelta används; verktygsanrop,
 * start/slut-händelser och `[DONE]` ignoreras.
 *
 * `rest` är en ofullständig sista rad som ska läggas framför nästa chunk.
 */
export function extractTextDeltas(buffer: string): { deltas: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const deltas: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload) as { type?: string; delta?: unknown };
      if (event.type === "text-delta" && typeof event.delta === "string") deltas.push(event.delta);
    } catch {
      // En trasig rad får inte fälla hela svaret.
    }
  }
  return { deltas, rest };
}
