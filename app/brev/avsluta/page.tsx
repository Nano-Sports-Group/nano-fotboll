/**
 * /brev/avsluta — avsluta Lagbriefen via länken i ett brev, utan inloggning.
 *
 * GET tittar bara, POST avslutar: en länkskanner ska inte kunna avsluta åt läsaren.
 * Mejlklientens egen "avsluta"-knapp går till POST /api/newsletter/unsubscribe (RFC 8058).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { peekNewsletterToken, type NewsletterTokenOutcome } from "@/lib/newsletter/service";
import { unsubscribeNewsletterAction } from "@/app/brev/actions";

export const metadata: Metadata = {
  title: "Avsluta Lagbriefen | Nano Fotboll",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewsletterUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const done = params["done"];
  const token = typeof params["token"] === "string" ? params["token"] : "";

  let kind: NewsletterTokenOutcome | "ask" = "invalid";
  if (done === "ok" || done === "already") kind = done;
  else if (!done && token) {
    const peek = await peekNewsletterToken("unsubscribe", token);
    kind = peek === "ok" ? "ask" : peek;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-16 sm:py-24">
      {kind === "ask" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Avsluta Lagbriefen?</h1>
          <p className="mt-4 text-muted-foreground">Du får inga fler brev. Kontot och appen påverkas inte.</p>
          <form action={unsubscribeNewsletterAction} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              data-cta="primary"
              className="min-h-11 w-full rounded-md bg-pitch px-4 py-2.5 font-medium text-white sm:w-auto"
            >
              Avsluta prenumerationen
            </button>
          </form>
        </>
      ) : kind === "invalid" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Länken fungerar inte.</h1>
          <p className="mt-4 text-muted-foreground">
            Den kan vara felkopierad. Är du inloggad kan du stänga av brevet under Profil.
          </p>
          <Link href="/profil" className="mt-6 inline-block rounded-md border border-border px-4 py-2.5 font-medium">
            Till profilen
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            {kind === "already" ? "Redan avslutad." : "Avslutad."}
          </h1>
          <p className="mt-4 text-muted-foreground">Du får inga fler brev från oss. Ångrar du dig kan du anmäla dig igen när du vill.</p>
        </>
      )}
    </main>
  );
}
