import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Clock3, Mail, ShieldCheck } from "lucide-react";
import { ProductEventTracker } from "@/components/analytics/ProductEventTracker";
import { NewsletterSignupForm } from "@/components/newsletter/NewsletterSignupForm";
import { getNewsletterTeamBySlug } from "@/lib/newsletter/service";
import { getSiteUrl } from "@/lib/site-url";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamSlug: string }>;
}): Promise<Metadata> {
  const { teamSlug } = await params;
  const team = await getNewsletterTeamBySlug(teamSlug);
  if (!team) return { title: "Lagbrief hittades inte" };
  return {
    title: `${team.name} Lagbrief`,
    description: `Det viktigaste om ${team.name}, utvalt och förklarat av Nano Fotboll.`,
    alternates: { canonical: `${getSiteUrl()}/brev/${team.slug}` },
  };
}

export default async function TeamNewsletterPage({
  params,
}: {
  params: Promise<{ teamSlug: string }>;
}) {
  const { teamSlug } = await params;
  const [team, session] = await Promise.all([
    getNewsletterTeamBySlug(teamSlug),
    auth(),
  ]);
  if (!team) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <section className="pt-2">
          <p className="text-sm font-semibold uppercase text-pitch-ink">
            Nano Fotboll Lagbrief
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-balance sm:text-5xl">
            {team.name}, utan bruset.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Det här behöver du veta om Allsvenskan och ditt lag – och vad det
            betyder härnäst. Utvalt för supportern, inte för klicket.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: Mail,
                title: "Allsvenskan först",
                body: "Ligans viktigaste, sedan ditt lag.",
              },
              {
                icon: Clock3,
                title: "Under två minuter",
                body: "Komplett värde direkt i inkorgen.",
              },
              {
                icon: ShieldCheck,
                title: "Lugn frekvens",
                body: "Du väljer takt och kan avsluta när som helst.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-4">
                <Icon className="h-5 w-5 text-pitch-ink" aria-hidden />
                <p className="mt-3 text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Nästa Lagbrief
            </p>
            <p className="mt-2 text-lg font-semibold">
              Läget kring {team.name}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Huvudsaken, ett par relevanta sidospår och vad som väntar. Inget
              utfyllnadsmaterial när underlaget är tunt.
            </p>
          </div>
        </section>

        <aside className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <p className="text-sm font-semibold text-pitch-ink">{team.name}</p>
          <h2 className="mt-1 text-2xl font-bold text-balance">
            Välj din Lagbrief
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Vi skickar en bekräftelselänk innan något brev går ut.
          </p>
          <div className="mt-6">
            <ProductEventTracker
              event="newsletter_landing_view"
              props={{ team_slug: team.slug }}
              once={`nl_landing:${team.slug}`}
            />
            <NewsletterSignupForm
              teamSlug={team.slug}
              teamName={team.name}
              authenticated={!!session.userId}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
