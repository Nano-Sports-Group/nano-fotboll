"use client";

/**
 * Lägg till / ta bort en sport på befintlig prenumeration (POST /api/billing/sports).
 * Två steg: första trycket visar prisändringen, andra trycket genomför den. Stripe
 * proraterar; servern räknar alltid priset — klienten visar bara vad servern skulle ta.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Plan } from "@/lib/access-rules";
import { COMBO_PRICING, SPORT_PRICING, formatKr } from "@/lib/pricing";

type Sport = "football" | "hockey";
const LABEL: Record<Sport, string> = { football: "Fotboll", hockey: "Hockey" };

function paid(p: Plan) {
  return p === "pro" || p === "elite";
}

export function SportAccess({ footballPlan, hockeyPlan }: { footballPlan: Plan; hockeyPlan: Plan }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ action: "add" | "remove"; sport: Sport } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFootball = paid(footballPlan);
  const hasHockey = paid(hockeyPlan);
  if (!hasFootball && !hasHockey) return null;

  const elite = footballPlan === "elite";
  const combo = COMBO_PRICING[elite ? "elite" : "pro"].monthly;
  const single: Record<Sport, number> = {
    football: SPORT_PRICING.football[elite ? "elite" : "pro"].monthly,
    hockey: SPORT_PRICING.hockey.pro.monthly,
  };

  // Vad ändringen gör med månadspriset (ordinarie pris; Founder-rabatt räknas på servern).
  function delta(action: "add" | "remove", sport: Sport): string {
    const other: Sport = sport === "football" ? "hockey" : "football";
    const diff = action === "add" ? combo - single[other] : single[other] - combo;
    return `${diff > 0 ? "+" : "−"}${formatKr(Math.abs(diff))}/mån`;
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/sports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Ändringen gick inte igenom. Försök igen.");
        return;
      }
      setPending(null);
      router.refresh();
    } catch {
      setError("Ingen anslutning. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  const rows: { sport: Sport; has: boolean }[] = [
    { sport: "football", has: hasFootball },
    { sport: "hockey", has: hasHockey },
  ];
  const both = hasFootball && hasHockey;

  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-foreground">Sporter i din prenumeration</p>
      {rows.map(({ sport, has }) => {
        const action: "add" | "remove" = has ? "remove" : "add";
        // Sista sporten tas inte bort här — det är en uppsägning (via Stripe).
        const allowed = action === "add" || both;
        const isPending = pending?.sport === sport && pending.action === action;
        return (
          <div key={sport} className="flex items-center justify-between gap-3 min-h-11">
            <div>
              <p className="text-sm text-foreground">{LABEL[sport]}</p>
              <p className="text-xs text-muted-foreground">{has ? "Ingår" : "Ingår inte"}</p>
            </div>
            {allowed &&
              (isPending ? (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="min-h-11 rounded-xl border border-pitch/40 bg-pitch/10 px-4 text-sm font-medium text-pitch-ink disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Sparar" /> : `Bekräfta ${delta(action, sport)}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPending({ action, sport });
                  }}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-muted/40"
                >
                  {action === "add" ? `Lägg till ${LABEL[sport].toLowerCase()}` : "Ta bort"}
                </button>
              ))}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive-ink">
          {error}
        </p>
      )}
    </div>
  );
}
