"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { Drawer } from "vaul";
import { useDraft } from "@/hooks/useDraft";
import { extractTextDeltas } from "@/lib/ai/ui-stream";

type Msg = { role: "user" | "assistant"; text: string };

const UPGRADE_RESPONSE = `**AI-assistenten ingår i PRO.**

Uppgradera för att fråga om avsnittet.`;

export function PodcastAskSheet({
  open,
  onOpenChange,
  episodeId,
  episodeTitle,
  suggestions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  episodeTitle: string;
  suggestions: { label: string; q: string }[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput, clearDraft] = useDraft(`podcast-chat:${episodeId}`);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;
      const q = question.trim();
      setInput("");
      clearDraft();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setLoading(true);

      try {
        // Samma protokoll som /ai och /api/elite/chat: UIMessage med parts in, UI message stream ut.
        const toMsg = (role: Msg["role"], text: string) => ({ role, parts: [{ type: "text", text }] });
        const history = [...messages, { role: "user" as const, text: q }].map((m) => toMsg(m.role, m.text));
        const res = await fetch("/api/elite/podcast-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeId, messages: history }),
        });

        if (!res.ok) {
          const serverError = await res
            .json()
            .then((b: { error?: unknown }) => (typeof b.error === "string" ? b.error : null))
            .catch(() => null);
          const errText =
            res.status === 403
              ? UPGRADE_RESPONSE
              : res.status === 401
                ? "Logga in för att fråga om avsnittet."
                : (serverError ?? "Ett fel uppstod. Försök igen om en stund.");
          setMessages((prev) => [...prev, { role: "assistant", text: errText }]);
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", text: "" }]);
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let pending = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const parsed = extractTextDeltas(pending + dec.decode(value, { stream: true }));
          pending = parsed.rest;
          const chunk = parsed.deltas.join("");
          if (!chunk) continue;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              text: next[next.length - 1].text + chunk,
            };
            return next;
          });
        }
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", text: "Något gick fel. Försök igen." }]);
      } finally {
        setLoading(false);
      }
    },
    [clearDraft, episodeId, loading, messages, setInput],
  );

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[min(92dvh,720px)] flex-col rounded-t-3xl border-t border-border bg-popover text-popover-foreground outline-none">
          <div
            aria-hidden
            className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
          <Drawer.Close
            aria-label="Stäng"
            className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden />
          </Drawer.Close>

          <Drawer.Title className="px-4 pr-14 pt-2 text-base font-semibold text-balance">
            Fråga om avsnittet
          </Drawer.Title>
          <Drawer.Description className="px-4 pb-2 text-xs text-muted-foreground line-clamp-2">
            {episodeTitle}
          </Drawer.Description>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" role="log" aria-live="polite">
            {messages.length === 0 && !loading ? (
              <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s.q}
                    type="button"
                    onClick={() => ask(s.q)}
                    className="min-h-11 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition-colors hover:border-pitch/40 hover:bg-pitch/5"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 py-3">
                {messages.map((m, i) => (
                  <div key={`${m.role}-${i}`} className={m.role === "user" ? "flex justify-end" : ""}>
                    {m.role === "user" ? (
                      <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-border bg-muted px-4 py-3 text-sm text-foreground">
                        {m.text}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{m.text}</p>
                    )}
                  </div>
                ))}
                {loading && (
                  <p className="text-xs text-muted-foreground">Läser avsnittet…</p>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex shrink-0 items-end gap-2 border-t border-border px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
            aria-label="Skriv en fråga om avsnittet"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              placeholder="Vad sa de om…?"
              disabled={loading}
              rows={1}
              aria-label="Fråga"
              className="max-h-[120px] min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pitch/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Skicka fråga"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-pitch text-white transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function PodcastAskTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-cta="primary"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-pitch px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Sparkles className="size-4" aria-hidden />
      Fråga om avsnittet
    </button>
  );
}
