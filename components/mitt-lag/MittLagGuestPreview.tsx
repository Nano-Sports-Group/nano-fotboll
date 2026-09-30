"use client";

import { vertical } from "@/lib/vertical";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useFavoriteTeam } from "@/hooks/useFavoriteTeam";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatNumber } from "@/components/ui/StatNumber";
import { formLetter, formLabel } from "@/lib/form-letter";

type Preview = {
  team: { name: string; slug: string };
  position: number | null;
  form: ("W" | "D" | "L")[];
  nextMatch: {
    id: number;
    home: string;
    away: string;
    kickoffAt: string;
  } | null;
  news: { id: string; title: string; href: string }[];
  threads: { id: string; title: string; replyCount: number; href: string }[];
};

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Gäst: lokalt favoritlag → ärlig preview utan auth (LAUNCH-05). */
export function MittLagGuestPreview() {
  const { slug, isLoaded } = useFavoriteTeam();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(false);
  // Bumpas av "Försök igen" — hem-fliken ska aldrig vara en återvändsgränd.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded || !slug) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
    setError(false);
    fetch(`/api/team/${encodeURIComponent(slug)}/hub`)
      .then(async (res) => {
        if (!res.ok) throw new Error("fail");
        return res.json() as Promise<Preview>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, slug, attempt]);

  if (!isLoaded) {
    return <PageSkeleton shape="detail" />;
  }

  if (!slug) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-pitch/10 border border-pitch/30 flex items-center justify-center mx-auto">
          <Star className="h-7 w-7 text-pitch-ink" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">Mitt lag</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Välj favoritlag för en ärlig förhandsvisning — utan konto.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/onboarding"
            data-cta="primary"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pitch px-4 text-sm font-medium text-white transition-colors hover:bg-pitch/90"
          >
            Välj favoritlag
          </Link>
          <Link
            href={vertical.leaguePath}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Bläddra bland lag
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-5">
        <p className="text-sm text-muted-foreground">Kunde inte ladda laget just nu.</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-cta="primary"
            onClick={() => setAttempt((n) => n + 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pitch px-4 text-sm font-medium text-white transition-colors hover:bg-pitch/90"
          >
            Försök igen
          </button>
          <Link
            href="/onboarding"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Byt lag
          </Link>
        </div>
      </div>
    );
  }

  if (!preview) {
    return <PageSkeleton shape="detail" />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 pt-4 space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Förhandsvisning · {preview.team.name}
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-1 text-balance">
          {preview.team.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Riktig data — skapa konto för brief och notiser.
        </p>
      </header>

      {preview.position != null ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Tabellplacering
            </p>
            <div className="flex items-baseline gap-1.5">
              <StatNumber value={preview.position} className="text-4xl" />
              <span className="text-sm text-muted-foreground">av 16</span>
            </div>
          </div>
          {preview.form.length > 0 ? (
            <div className="flex gap-1 shrink-0">
              {preview.form.map((r, i) => (
                <span
                  key={i}
                  title={formLabel(r)}
                  aria-label={formLabel(r)}
                  className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    r === "W"
                      ? "bg-success/20 text-success"
                      : r === "L"
                        ? "bg-destructive/20 text-destructive-ink"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formLetter(r)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {preview.nextMatch ? (
        <Link
          href={`/match/${preview.nextMatch.id}`}
          className="block rounded-2xl border border-border bg-card px-5 py-4 hover:border-pitch/40 transition-colors"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Nästa match
          </p>
          <p className="mt-2 text-lg font-semibold">
            {preview.nextMatch.home} – {preview.nextMatch.away}
          </p>
          <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">
            {formatKickoff(preview.nextMatch.kickoffAt)}
          </p>
        </Link>
      ) : null}

      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Nyheter
        </p>
        {preview.news.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga nyheter just nu.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {preview.news.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className="block py-2.5 text-sm font-medium hover:text-pitch-ink line-clamp-2"
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Trådar
        </p>
        {preview.threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga trådar ännu.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {preview.threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.href}
                  className="flex justify-between gap-3 py-2.5 text-sm font-medium hover:text-pitch-ink"
                >
                  <span className="line-clamp-2">{t.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.replyCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Link
          href="/sign-up"
          data-cta="primary"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-pitch px-4 text-sm font-medium text-white hover:bg-pitch/90"
        >
          Skapa konto
        </Link>
        <Link
          href="/onboarding"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-muted-foreground hover:text-foreground"
        >
          Byt lag
        </Link>
      </div>
    </div>
  );
}
