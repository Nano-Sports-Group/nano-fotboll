"use client";

/**
 * Bekräfta uppgraderingen (POST /api/billing/upgrade). Servern räknar allt — knappen skickar ingen summa.
 * Vid lyckat köp till /konto?upgraded=elite; annars ett verkligt felmeddelande, aldrig tyst fel.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function UpgradeConfirm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/upgrade", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        router.replace("/konto?upgraded=elite");
        return;
      }
      // 402 (kortet nekades) och 409 (redan Elite m.fl.) bär en svensk förklaring från servern.
      setError(body.error ?? "Uppgraderingen gick inte igenom. Försök igen om en stund.");
    } catch {
      setError("Ingen kontakt med servern. Kontrollera din anslutning och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        data-cta="primary"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl pitch-gradient text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Uppgraderar
          </>
        ) : (
          "Uppgradera till Elite"
        )}
      </button>
      <Link
        href="/konto"
        className="flex min-h-11 items-center justify-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Inte nu
      </Link>
      {error && (
        <p role="alert" className="text-sm text-destructive-ink">
          {error}
        </p>
      )}
    </div>
  );
}
