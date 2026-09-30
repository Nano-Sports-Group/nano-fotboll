import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: "Skapa konto",
  description: `Skapa konto på ${vertical.productName} — ${vertical.tagline.toLowerCase()}.`,
  robots: { index: false, follow: true },
};

/** Samma ram som /sign-in — se den filen för varför. */
export default function SignUpPage() {
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
        {vertical.wordmark}
      </Link>

      <SignUp />

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
