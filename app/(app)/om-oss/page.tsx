import type { Metadata } from "next";
import Link from "next/link";
import { jsonLd } from "@/lib/json-ld";
import { getSiteUrl, CONTACT_EMAIL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Om Nano Fotboll – Svensk fotbollsintelligens för Allsvenskan",
  description: "Lär dig mer om Nano Fotboll — AI-driven nyhetsplattform för Allsvenskan med signalscoring, djupstatistik och lagforum.",
  alternates: { canonical: `${getSiteUrl()}/om-oss` },
  robots: { index: true, follow: true },
};

export default function OmOssPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Nano Fotboll",
        url: `${getSiteUrl()}`,
        foundingDate: "2026",
        description: "AI-driven nyhetsplattform för Allsvenskan med signalscoring, djupstatistik och lagforum.",
        contactPoint: {
          "@type": "ContactPoint",
          email: CONTACT_EMAIL,
          contactType: "editorial",
        },
        publishingPrinciples: `${getSiteUrl()}/om-oss`,
        inLanguage: "sv",
      })}} />

      <div>
        <h1 className="font-bold text-4xl sm:text-5xl text-foreground mb-4 text-balance">Om Nano Fotboll</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Nano Fotboll är en oberoende nyhetsplattform för Allsvenskan. Vi samlar signaler från över 40 svenska och internationella fotbollskällor, värderar dem med AI och presenterar det som faktiskt spelar roll — utan brus.
        </p>
      </div>

      <section>
        <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Vår metod</h2>
        <p className="text-muted-foreground leading-relaxed mb-3">
          Varje nyhet som når oss passerar genom ett signalscoringssystem. Systemet väger källans trovärdighet, nyhetens aktualitet och hur många oberoende källor som rapporterar om samma händelse. Nyheter med hög signalstyrka — till exempel en bekräftad transfer rapporterad av tre eller fler källor — lyfts upp i flödet.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Matchanalyser och sammanfattningar bygger på matchstatistik och nyhetsflödet. Vi publicerar aldrig råtext från tredjepartskällor — allt redaktionellt innehåll är egenproducerat.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Datakällor</h2>
        <ul className="text-muted-foreground leading-relaxed space-y-2 list-disc list-inside">
          <li><strong className="text-foreground">Matchdata:</strong> Sportmonks API — officiell leverantör av Allsvenskan-statistik, resultat och spelartrupper.</li>
          <li><strong className="text-foreground">Nyheter:</strong> RSS-flöden från över 40 svenska fotbollsmedier och officiella klubbkanaler.</li>
          <li><strong className="text-foreground">Podcasts:</strong> Transkriberade avsnitt från de ledande svenska fotbollspodcastsarna.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Kontakt</h2>
        <p className="text-muted-foreground leading-relaxed">
          Frågor, rättelser eller samarbetsförfrågningar skickas till{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch-ink hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Integritet</h2>
        <p className="text-muted-foreground leading-relaxed">
          Hur vi hanterar personuppgifter beskrivs i vår{" "}
          <Link href="/integritetspolicy" className="text-pitch-ink hover:underline">integritetspolicy</Link>.
        </p>
      </section>
    </div>
  );
}
