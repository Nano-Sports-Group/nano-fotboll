import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: "Logga in",
  description: "Logga in på Nano Fotboll — Allsvenskans hemmaplan.",
  robots: { index: false, follow: true },
};

/**
 * Auth-sidorna ligger utanför app-skalet (ingen header, sidebar eller dock).
 * Utan egen wordmark och väg tillbaka blir de en varumärkeslös återvändsgränd —
 * därför bär de sin egen ram runt Clerk-widgeten.
 */
export default function SignInPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12 focus:outline-none"
    >
      <Link
        href="/"
        className="font-heading text-2xl text-foreground transition-colors hover:text-pitch-ink
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        NANO FOTBOLL
      </Link>

      <SignIn />

      <p className="text-sm text-muted-foreground">
        <Link
          href="/"
          className="underline underline-offset-4 hover:text-foreground hover:no-underline
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Tillbaka till {vertical.productName}
        </Link>
      </p>
    </main>
  );
}
