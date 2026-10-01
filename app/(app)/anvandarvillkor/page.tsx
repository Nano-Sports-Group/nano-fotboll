import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site-url";
import { vertical } from "@/lib/vertical";

/**
 * Användarvillkor (2026-10-01). Avtalsparten är den registrerade enheten i Dubai; Nano-namnen är
 * varumärken. Svenska konsumenter behåller sina rättigheter enligt svensk lag — villkoren får aldrig
 * påstå något annat. Underlag och öppna juristfrågor: Drive `01 - Legal/Terms and Privacy Policy.md`.
 */
export const metadata: Metadata = {
  title: `Användarvillkor | ${vertical.productName}`,
  description: `Villkoren för att använda ${vertical.productName} och Nano Sports prenumerationer.`,
};

const H2 = "font-semibold text-2xl text-foreground mb-3 text-balance";

export default function AnvandarvillkorPage() {
  const mail = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch-ink hover:underline">
      {CONTACT_EMAIL}
    </a>
  );
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-bold text-4xl text-foreground mb-6 text-balance">Användarvillkor</h1>
      <div className="max-w-none space-y-6 text-muted-foreground leading-relaxed">
        <p>Gäller från 1 oktober 2026.</p>

        <section>
          <h2 className={H2}>Vem du avtalar med</h2>
          <p>
            Nano Fotboll, Nano Hockey och Nano Sport är varumärken som drivs av HMJ98 Internet Content
            Provider, en enskild firma registrerad i Dubai, Förenade Arabemiraten (licens 1652761).
            Kontakt: {mail}.
          </p>
        </section>

        <section>
          <h2 className={H2}>Tjänsten</h2>
          <p>
            Vi ger supportrar nyheter, tabeller, matcher, analyser, poddar och AI-funktioner om sitt lag.
            Grundtjänsten är gratis. PRO, Elite och kombinationer av sporter är betalda prenumerationer;
            aktuella priser och vad som ingår står på <Link href="/prenumerera" className="text-pitch-ink hover:underline">prenumerationssidan</Link>.
          </p>
        </section>

        <section>
          <h2 className={H2}>Konto</h2>
          <p>
            Du behöver ett konto för vissa funktioner. Uppgifterna du lämnar ska vara riktiga, och du ansvarar
            för att hålla din inloggning hemlig. Ett konto är personligt.
          </p>
        </section>

        <section>
          <h2 className={H2}>Prenumeration, betalning och uppsägning</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Priset som visas är det du betalar, i svenska kronor inklusive moms.</li>
            <li>Ingår en gratis provperiod debiteras du först när den slutar. Säger du upp innan dess kostar det inget.</li>
            <li>Prenumerationen förnyas automatiskt varje månad eller år tills du säger upp den.</li>
            <li>Du kan säga upp när som helst under Konto. Uppsägningen gäller från nästa period; du behåller tillgången perioden ut.</li>
            <li>Betalning via webben hanteras av Stripe. Köp i iPhone-appen hanteras av Apple och sägs upp i Apples inställningar.</li>
            <li>Ändrar vi priset får du besked minst 30 dagar innan det gäller dig, och kan säga upp innan dess.</li>
            <li>Founder-priset gäller så länge din prenumeration fortsätter utan avbrott.</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>Ångerrätt</h2>
          <p>
            Som konsument har du 14 dagars ångerrätt från köpet enligt lagen om distansavtal. Ber du oss
            starta tjänsten direkt och ångrar dig inom 14 dagar betalar du för den tid du hunnit använda den.
            Meddela oss på {mail} eller säg upp under Konto.
          </p>
        </section>

        <section>
          <h2 className={H2}>Innehåll skapat med AI</h2>
          <p>
            Många av våra texter, sammanfattningar och poddar tas fram med AI och granskas automatiskt mot
            källorna innan de publiceras. Trots det kan fel förekomma. Innehållet är information om sport,
            inte råd om spel eller betting. Hur vi använder AI beskrivs på{" "}
            <Link href="/ai-transparens" className="text-pitch-ink hover:underline">AI-transparens</Link>.
          </p>
        </section>

        <section>
          <h2 className={H2}>Det du publicerar</h2>
          <p>
            Inlägg i forum och kommentarer är ditt ansvar. Du ger oss rätt att visa dem i tjänsten. Inte
            tillåtet: hot, hat, trakasserier, personangrepp, olagligt innehåll, spam eller att publicera
            andras upphovsrättsskyddade material. Vi får ta bort inlägg och stänga konton som bryter mot
            villkoren.
          </p>
        </section>

        <section>
          <h2 className={H2}>Vårt material</h2>
          <p>
            Texter, design, betyg och sammanställningar i tjänsten tillhör oss eller våra licensgivare. Du får
            använda dem privat, men inte kopiera, sälja eller samla in dem automatiskt.
          </p>
        </section>

        <section>
          <h2 className={H2}>Ansvar</h2>
          <p>
            Vi gör vårt bästa för att tjänsten ska fungera och vara korrekt, men kan inte lova att den alltid
            är tillgänglig eller felfri. Vårt ansvar begränsas så långt lagen tillåter. Begränsningen gäller
            aldrig dina rättigheter som konsument enligt tvingande lag.
          </p>
        </section>

        <section>
          <h2 className={H2}>Personuppgifter</h2>
          <p>
            Hur vi hanterar dina uppgifter står i <Link href="/integritetspolicy" className="text-pitch-ink hover:underline">integritetspolicyn</Link>.
          </p>
        </section>

        <section>
          <h2 className={H2}>Ändringar och tvister</h2>
          <p>
            Vi kan ändra villkoren. Väsentliga ändringar meddelas minst 30 dagar innan de gäller. Är du
            konsument i Sverige gäller alltid det skydd som svensk konsumentlagstiftning ger dig, och du kan vända
            dig till Allmänna reklamationsnämnden (ARN). Hör gärna av dig till oss först: {mail}.
          </p>
        </section>
      </div>
    </div>
  );
}
