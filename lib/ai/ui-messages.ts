/**
 * Chattklienterna (useChat + DefaultChatTransport, ai@7) skickar UIMessage med `parts`
 * och väntar sig en UI message stream tillbaka. Routerna validerade tidigare
 * `{ role, content }` och svarade med ren text — varje meddelande gav 400, och även
 * ett giltigt svar gick inte att tolka i klienten. Den här modulen är gränsen.
 */
import { z } from "zod";

const MAX_TEXT = 4_000;

const PartSchema = z.object({ type: z.string(), text: z.string().optional() }).passthrough();

export const UiMessagesSchema = z
  .array(
    z
      .object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(PartSchema).max(50),
      })
      .passthrough(),
  )
  .min(1)
  .max(20);

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * UIMessage[] → modellens meddelanden: bara textdelar (verktygsanrop i historiken
 * körs om vid behov), tomma tur bort, varje tur kapad till samma tak som förut.
 * Returnerar null om sista turen inte är användarens — då finns inget att svara på.
 */
export function toChatTurns(messages: z.infer<typeof UiMessagesSchema>): ChatTurn[] | null {
  const turns = messages
    .map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n")
        .trim()
        .slice(0, MAX_TEXT),
    }))
    .filter((t) => t.content.length > 0);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return null;
  return turns;
}
