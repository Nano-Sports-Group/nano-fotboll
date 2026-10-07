"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs/legacy";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Loader2 } from "lucide-react";
import { handoffRedirectPath, parseHandoffFragment } from "@/lib/billing/web-handoff";

type State =
  | { kind: "working" }
  | { kind: "invalid" }
  | { kind: "failed" }
  | { kind: "signed_in"; next: string };

export function HandoffClient() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;

    const { ticket, platform, target } = parseHandoffFragment(window.location.hash);
    // Biljetten är engångs. Ta bort den ur adressraden och historiken innan något annat händer.
    window.history.replaceState(null, "", window.location.pathname);
    // Målet byggs ur en fast lista, aldrig ur adressen.
    const next = handoffRedirectPath(target, platform);

    (async () => {
      if (!ticket) {
        setState({ kind: "invalid" });
        return;
      }
      try {
        const attempt = await signIn.create({ strategy: "ticket", ticket });
        if (attempt.status === "complete" && attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
          router.replace(next);
          return;
        }
        setState({ kind: "failed" });
      } catch (err) {
        const code = isClerkAPIResponseError(err) ? err.errors[0]?.code : undefined;
        setState(code === "session_exists" ? { kind: "signed_in", next } : { kind: "failed" });
      }
    })();
  }, [isLoaded, signIn, setActive, router]);

  if (state.kind === "working") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loggar in och öppnar Nano
      </p>
    );
  }

  const message =
    state.kind === "signed_in"
      ? "Du är redan inloggad i den här webbläsaren."
      : state.kind === "invalid"
        ? "Länken är ogiltig. Gå tillbaka till appen och försök igen."
        : "Länken har gått ut eller har redan använts. Gå tillbaka till appen och försök igen.";

  return (
    <div className="flex max-w-sm flex-col items-center gap-4">
      <p role="alert" className="text-sm text-foreground">
        {message}
      </p>
      {state.kind === "signed_in" ? (
        <Link href={state.next} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-pitch-ink underline underline-offset-4">
          Fortsätt
        </Link>
      ) : (
        <Link href="/sign-in" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Logga in med e-post
        </Link>
      )}
    </div>
  );
}
