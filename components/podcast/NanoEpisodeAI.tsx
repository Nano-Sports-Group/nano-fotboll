"use client";

/**
 * Artikel ("The Athletic-standard": egna ord, korta exakta citat med källa) och
 * frågor om avsnittet, via /api/podd/[episodeId] → Nano Podcast API.
 * Visar aldrig transkript — bara artikeln och utdrag om max 25 ord med tidskod.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { FileText, Loader2, MessageCircleQuestion } from "lucide-react";
import {
  formatClock,
  type PodAnswer,
  type PodArticle,
} from "@/lib/podcast/nano-api";

type ApiError = { error?: { code?: string; message?: string } };

const MESSAGES: Record<string, string> = {
  NOT_ENTITLED:
    "Det här ingår inte i din plan. Uppgradera till PRO för att låsa upp.",
  USAGE_LIMIT_REACHED: "Du har använt din kvot för perioden. PRO ger fler.",
  AI_PROCESSING_NOT_PERMITTED: "Podden har inte godkänt AI-bearbetning ännu.",
  TRANSCRIPT_UNAVAILABLE: "Avsnittet kan inte bearbetas ännu.",
  RATE_LIMITED: "För många förfrågningar just nu. Försök igen om en minut.",
  TRANSCRIPT_NOT_READY:
    "Avsnittet är inte genomlyssnat ännu. Tryck på ”Läs artikeln” först.",
  INVALID_MODEL_OUTPUT:
    "Artikeln klarade inte vår citatkontroll. Försök igen senare.",
};
const message = (b: unknown) =>
  MESSAGES[(b as ApiError)?.error?.code ?? ""] ??
  "Något gick fel. Försök igen.";

async function post(episodeId: string, body: unknown) {
  const res = await fetch(`/api/podd/${episodeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as unknown,
  };
}

const POLL_MS = 8_000;
const POLL_MAX = 75; // ~10 min: transkribering + artikel

export function NanoEpisodeAI({
  episodeId,
  aiAvailable,
}: {
  episodeId: string;
  aiAvailable: boolean;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const [article, setArticle] = useState<PodArticle | null>(null);
  const [state, setState] = useState<
    "idle" | "working" | "transcribing" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function requestArticle() {
    setError(null);
    const r = await post(episodeId, { action: "article" });
    const b = r.body as {
      status?: string;
      result?: PodArticle;
      error?: { message: string };
    } | null;
    if (r.status === 200 && b?.status === "ready" && b.result) {
      setArticle(b.result);
      setState("idle");
      return;
    }
    if (r.status === 200 && b?.status === "failed") {
      setState("error");
      setError(message({ error: b.error }));
      return;
    }
    if (r.status === 202 || (r.status === 200 && b?.status !== "ready")) {
      setState(b?.status === "transcribing" ? "transcribing" : "working");
      if (++polls.current > POLL_MAX) {
        setState("error");
        setError("Det tar längre tid än väntat. Kom tillbaka om en stund.");
        return;
      }
      timer.current = setTimeout(requestArticle, POLL_MS);
      return;
    }
    setState("error");
    setError(message(r.body));
  }

  if (!aiAvailable) return null;

  return (
    <section className="mb-10 space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-pitch-ink mb-2">
          <FileText className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Nano-artikel
          </span>
        </div>

        {article ? (
          <ArticleView a={article} />
        ) : !isLoaded ? null : !isSignedIn ? (
          <p className="text-sm text-muted-foreground">
            <SignInButton mode="modal">
              <button className="text-pitch-ink font-medium hover:underline">
                Logga in
              </button>
            </SignInButton>{" "}
            för att läsa vår artikel om avsnittet.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Det viktigaste ur avsnittet, skrivet av oss — med korta citat och
              källa.
            </p>
            {state === "working" || state === "transcribing" ? (
              <p className="inline-flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="size-4 animate-spin" />
                {state === "transcribing"
                  ? "Lyssnar igenom avsnittet…"
                  : "Skriver artikeln…"}
              </p>
            ) : (
              <button
                onClick={() => {
                  polls.current = 0;
                  setState("working");
                  void requestArticle();
                }}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white pitch-gradient hover:opacity-90 transition-opacity"
              >
                Läs artikeln
              </button>
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </>
        )}
      </div>

      {isSignedIn && <AskBox episodeId={episodeId} />}
    </section>
  );
}

function ArticleView({ a }: { a: PodArticle }) {
  const published = a.attribution.publishedAt
    ? new Date(a.attribution.publishedAt).toLocaleDateString("sv-SE", {
        timeZone: "Europe/Stockholm",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  return (
    <article>
      <h2 className="text-xl font-bold text-foreground text-balance leading-snug">
        {a.headline}
      </h2>
      <p className="mt-2 text-base text-muted-foreground">{a.dek}</p>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-foreground">
        {/* Markdown light: stycken, utan rendering av HTML. */}
        {a.body
          .split(/\n{2,}/)
          .map((p) =>
            p
              .replace(/^#+\s*/, "")
              .replace(/\*\*|__/g, "")
              .trim(),
          )
          .filter(Boolean)
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
      {a.quotes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {a.quotes.map((q, i) => (
            <li key={i}>
              ”{q.text}” — {q.speaker ?? "i avsnittet"},{" "}
              {formatClock(q.startMs)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Källa: {a.attribution.podcastTitle}
        {a.attribution.publisher ? ` (${a.attribution.publisher})` : ""}, ”
        {a.attribution.episodeTitle}”{published ? `, ${published}` : ""}.{" "}
        {a.attribution.url && (
          <a
            href={a.attribution.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pitch-ink hover:underline"
          >
            Lyssna på originalet
          </a>
        )}
      </p>
    </article>
  );
}

function AskBox({ episodeId }: { episodeId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [turns, setTurns] = useState<
    Array<{ q: string; a: PodAnswer["message"] | null; err?: string }>
  >([]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (question.length < 3 || busy) return;
    setBusy(true);
    setQ("");
    const r = await post(episodeId, {
      action: "ask",
      question,
      conversationId,
    });
    const b = r.body as PodAnswer | null;
    if (r.status === 200 && b?.message) {
      setConversationId(b.conversationId);
      setTurns((t) => [...t, { q: question, a: b.message }]);
    } else {
      setTurns((t) => [...t, { q: question, a: null, err: message(r.body) }]);
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-pitch-ink mb-3">
        <MessageCircleQuestion className="size-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          Fråga avsnittet
        </span>
      </div>
      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">{t.q}</p>
            {t.a ? (
              <>
                <p className="text-sm text-foreground leading-relaxed">
                  {t.a.content}
                </p>
                {t.a.evidence.slice(0, 3).map((ev, j) => (
                  <p key={j} className="text-xs text-muted-foreground">
                    {formatClock(ev.startMs)} · ”{ev.excerpt}”
                  </p>
                ))}
              </>
            ) : (
              <p className="text-sm text-destructive">{t.err}</p>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={1000}
          placeholder="Vad sa de om backlinjen?"
          aria-label="Fråga om avsnittet"
          className="min-w-0 flex-1 h-10 rounded-full border border-border bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 3}
          className="inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium text-white pitch-gradient disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Fråga"}
        </button>
      </form>
    </div>
  );
}
