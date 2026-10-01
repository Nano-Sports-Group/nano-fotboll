import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site-url";
import { vertical } from "@/lib/vertical";

export const metadata: Metadata = {
  title: `Integritetspolicy | ${vertical.productName}`,
  description: `Hur ${vertical.productName} hanterar dina personuppgifter.`,
};

export default function IntegritetspolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-bold text-4xl text-foreground mb-6 text-balance">Integritetspolicy</h1>
      <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
        <p>
          {vertical.productName} (&quot;vi&quot;, &quot;oss&quot;) värnar om din integritet. Denna policy beskriver
          vilka uppgifter vi samlar in, hur de används och dina rättigheter.
        </p>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Personuppgiftsansvarig</h2>
          <p>
            HMJ98 Internet Content Provider, enskild firma i Dubai, Förenade Arabemiraten (licens 1652761),
            som driver varumärkena Nano Fotboll, Nano Hockey och Nano Sport. Kontakt:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch-ink hover:underline">{CONTACT_EMAIL}</a>.
            Villkoren för tjänsten står i <a href="/anvandarvillkor" className="text-pitch-ink hover:underline">användarvillkoren</a>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Vilka uppgifter samlar vi in?</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>E-postadress och profilinformation (via Clerk)</li>
            <li>Betalningsinformation (hanteras av Stripe)</li>
            <li>Läsbeteende och preferenser för att personalisera ditt flöde</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Hur använder vi uppgifterna?</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>För att tillhandahålla och förbättra tjänsten</li>
            <li>För att hantera prenumerationer och betalningar</li>
            <li>För att skicka relevanta notiser (om du godkänt det)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Dina rättigheter</h2>
          <p>
            Du har rätt att begära tillgång till, rättelse eller radering av dina personuppgifter.
            Kontakta oss på <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch-ink hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Cookies</h2>
          <p>
            Vi använder nödvändiga cookies för autentisering och sessionhantering.
            Inga tredjepartsspårningscookies används utan ditt samtycke.
          </p>
        </section>

        <p className="text-sm">Senast uppdaterad: 1 oktober 2026</p>
      </div>
    </div>
  );
}
