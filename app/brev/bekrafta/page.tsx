/**
 * /brev/bekrafta — dubbel bekräftelse för Lagbriefen.
 *
 * GET tittar bara. POST (server action) bekräftar. Mejlklienters länkskannrar
 * ska inte kunna bekräfta en adress åt någon. Samma mönster som /vaenta/bekrafta.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { peekNewsletterToken, type NewsletterTokenOutcome } from "@/lib/newsletter/service";
import { confirmNewsletterAction } from "@/app/brev/actions";

export const metadata: Metadata = {
  title: "Bekräfta Lagbriefen | Nano Fotboll",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Outcome({ kind }: { kind: NewsletterTokenOutcome }) {
  if (kind === "invalid") {
    return (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">Länken fungerar inte.</h1>
        <p className="mt-4 text-muted-foreground">
          Den kan vara felkopierad, eller så är prenumerationen avslutad. Anmäl dig igen så skickar vi en ny.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-md bg-pitch px-4 py-2.5 font-medium text-white">
          Till startsidan
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        {kind === "already" ? "Redan bekräftad." : "Klart. Lagbriefen är på väg."}
      </h1>
      <p className="mt-4 text-muted-foreground">
        Du får brevet när det finns något värt att läsa om ditt lag. Avsluta när du vill via länken i varje brev.
      </p>
    </>
  );
}

export default async function NewsletterConfirmPage({
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
    const peek = await peekNewsletterToken("confirm", token);
    kind = peek === "ok" ? "ask" : peek;
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-16 sm:py-24">
      {kind === "ask" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">En sista bekräftelse.</h1>
          <p className="mt-4 text-muted-foreground">Klicka så börjar Lagbriefen komma till din e-post.</p>
          <form action={confirmNewsletterAction} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              data-cta="primary"
              className="min-h-11 w-full rounded-md bg-pitch px-4 py-2.5 font-medium text-white sm:w-auto"
            >
              Bekräfta prenumerationen
            </button>
          </form>
        </>
      ) : (
        <Outcome kind={kind} />
      )}
    </main>
  );
}
