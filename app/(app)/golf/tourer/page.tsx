import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GolfSection, TourList } from "@/components/golf/cards";
import { GOLF_TOURS } from "@/lib/golf/catalog";
import { absoluteUrl } from "@/lib/site-url";
import { VERTICAL } from "@/lib/vertical";

export const metadata: Metadata = {
  title: "Tourer och tävlingar",
  description: "Tourerna och tävlingarna Nano Golf följer: PGA Tour, DP World Tour, LPGA, LET, LIV Golf, majors, Ryder Cup och Solheim Cup.",
  alternates: { canonical: absoluteUrl("/golf/tourer") },
};

export default function GolfToursPage() {
  if (VERTICAL !== "golf") notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8">
      <h1 className="font-bold text-4xl sm:text-5xl text-foreground text-balance">Tourer</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Golf har ingen serie och ingen tabell — den har tourer som pågår hela året och tävlingar som alla väntar på.
        Följ dem du vill ha i flödet.
      </p>

      <GolfSection title="Tourerna">
        <TourList tours={GOLF_TOURS.filter((t) => t.kind === "tour")} />
      </GolfSection>

      <GolfSection title="Tävlingarna">
        <TourList tours={GOLF_TOURS.filter((t) => t.kind === "event")} />
      </GolfSection>
    </div>
  );
}
