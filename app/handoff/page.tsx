import type { Metadata } from "next";
import { HandoffClient } from "./HandoffClient";

export const metadata: Metadata = {
  title: "Öppnar Nano",
  description: "Du loggas in och skickas vidare.",
  robots: { index: false, follow: false },
  // Biljetten ligger i URL-fragmentet och skickas aldrig till servern; ingen referer ut heller.
  referrer: "no-referrer",
};

/**
 * Landningssida för "Fortsätt på Nano Web" från en app (POST /api/billing/web-handoff).
 * Utanför app-skalet, som /sign-in. Själva inloggningen sker i klienten: Clerk-biljetten löses in
 * med `signIn.create({ strategy: "ticket" })` och användaren skickas till en FAST intern sökväg.
 */
export default function HandoffPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-12 text-center focus:outline-none"
    >
      <HandoffClient />
    </main>
  );
}
