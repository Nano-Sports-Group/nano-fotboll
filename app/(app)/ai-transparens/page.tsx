import type { Metadata } from "next";
import { resolveEditorialResponsibility } from "@/lib/editorial-responsibility";
import { CONTACT_EMAIL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "AI-transparens | Nano Fotboll",
  description:
    "Hur Nano Fotboll använder AI, hur AI-genererat innehåll märks och vem som är ansvarig utgivare.",
};

export default function AiTransparensPage() {
  const editorial = resolveEditorialResponsibility();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-bold text-4xl text-foreground mb-6 text-balance">AI-transparens</h1>
      <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
        <p>
          Nano Fotboll använder artificiell intelligens för att skriva, sammanfatta och analysera
          innehåll om svensk fotboll. Den här sidan beskriver var AI används, hur innehållet
          märks och vem som ansvarar för det — i enlighet med artikel 50 i EU:s
          AI-förordning (EU) 2024/1689.
        </p>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Var vi använder AI</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Artiklar och sammanfattningar</strong> — texter märkta
              &quot;AI-genererad av Nano Fotboll&quot; är skrivna av en språkmodell utifrån
              publicerade källor och strukturerad matchdata.
            </li>
            <li>
              <strong>Nano Fotboll Daily</strong> — både manus och uppläsande röst är
              AI-genererade. Rösten föreställer ingen verklig person.
            </li>
            <li>
              <strong>Fråga Nano Fotboll</strong> — en AI-assistent. Du interagerar med ett
              AI-system, inte med en människa.
            </li>
            <li>
              <strong>Flödesrangordning</strong> — vilka nyheter du ser först påverkas av
              automatiserad rangordning utifrån ditt lag och ditt läsbeteende.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Hur AI-innehåll märks</h2>
          <p>
            Allt AI-genererat innehåll bär en synlig märkning på sidan där det visas — den
            döljs aldrig bakom betalvägg eller inställningar. Märkningen finns dessutom
            maskinläsbart i sidans strukturerade data (
            <code>aiGenerated</code> i JSON-LD), så att sökmotorer och andra system kan
            identifiera innehållet automatiskt.
          </p>
          <p>
            Länkkort i nyhetsflödet som består av rubrik, källa och länk till annan
            publicist är <em>inte</em> AI-genererade och märks därför inte som sådana.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">
            Mänsklig granskning och redaktionellt ansvar
          </h2>
          <p>
            AI-genererat innehåll publiceras efter mänskligt godkännande. Automatisk
            publicering utan mänsklig granskning är avstängd. Varje godkännande loggas med
            granskarens identitet.
          </p>
          <p>
            <strong>Ansvarig utgivare:</strong>{" "}
            <span data-legal-signoff={editorial.isNamedPerson ? "named" : "entity"}>
              {editorial.label}
            </span>
            . Kontakt:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-pitch-ink hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Begränsningar</h2>
          <p>
            AI-genererad text kan innehålla fel. Vi grundar innehållet i verkliga resultat
            och statistik, men uppgifter bör kontrolleras mot originalkällan innan de
            används som beslutsunderlag. Hittar du ett fel — mejla oss, vi rättar.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-2xl text-foreground mb-3 text-balance">Upphovsrätt</h2>
          <p>
            Nano Fotboll återger aldrig andra publicisters brödtext ordagrant. Externa nyheter
            visas som rubrik, källnamn och länk till originalet.
          </p>
        </section>

        <p className="text-sm">Senast uppdaterad: juli 2026</p>
      </div>
    </div>
  );
}
