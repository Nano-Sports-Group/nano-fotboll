"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import type { PaidPlan, BillingInterval } from "@/lib/pricing";
import { trackEvent } from "@/lib/track";

interface Props {
  plan: PaidPlan;
  interval: BillingInterval;
  label: string;
  variant?: "primary" | "outline";
  /** Fotboll + Hockey i en prenumeration. */
  combo?: boolean;
}

export function CheckoutButton({ plan, interval, label, variant = "primary", combo = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const router = useRouter();

  async function handleCheckout() {
    // Detta var produktens enda helt oinstrumenterade betal-CTA. UpgradePrompt och
    // FeedPaywallBanner loggar via TrackedLink, men huvudknappen på /prenumerera
    // loggade ingenting — konverteringen gick inte att skilja från utebliven trafik.
    trackEvent("paywall_cta_click", { plan, interval, combo, surface: "prenumerera" });

    if (!isSignedIn) {
      router.push("/sign-up?redirect_url=/onboarding");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval, combo }),
      });
      const { url, error: apiError } = await res.json();

      if (apiError || !url) {
        setError("Vi kunde inte öppna betalningen. Försök igen om en stund.");
        return;
      }

      window.location.href = url;
    } catch {
      setError("Ingen kontakt med servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setLoading(false);
    }
  }

  const styles =
    variant === "primary"
      ? "pitch-gradient text-white hover:opacity-90"
      : "border border-pitch/40 text-foreground hover:border-pitch";

  return (
    <div className="w-full">
      <button
        onClick={handleCheckout}
        disabled={loading}
        // Markerar vyns framhävda handling (mobil UX-regel 4). Elite-kortet
        // kör variant="outline" och räknas därför inte som en andra primär CTA.
        data-cta={variant === "primary" ? "primary" : undefined}
        className={`w-full h-11 rounded-xl font-medium text-sm transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 ${styles}`}
        aria-label={`Starta ${plan}-prenumeration`}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Laddar…
          </>
        ) : (
          label
        )}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive-ink">
          {error}
        </p>
      )}
    </div>
  );
}
