import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Container } from "./primitives";

/**
 * Sportväljaren under heron: Nano är flera sporter, fotbollen först.
 * Hockeyytan har tabell och spelschema live (Sportradar) men inget redaktionellt
 * intag än — copyn lovar inte mer än så.
 */
const SPORTS = [
  {
    key: "fotboll",
    title: "Fotboll",
    league: "Allsvenskan",
    body: "Nyheter, tabell, matcher och analys för alla 16 klubbar.",
    href: "/allsvenskan",
    image: "/landing/sport-fotboll.jpg",
    alt: "Fullsatt fotbollsarena i kvällsljus, sett från gräset vid målstolpen",
    position: "object-[50%_45%]",
  },
  {
    key: "hockey",
    title: "Hockey",
    league: "SHL",
    body: "Tabell och spelschema live. Nyheterna kommer snart.",
    href: "https://hockey.nanosport.se/shl",
    image: "/landing/sport-hockey.jpg",
    alt: "Puck på isen i en tom hockeyarena",
    position: "object-bottom",
  },
] as const;

export function SportCards() {
  return (
    <section aria-labelledby="sporter-rubrik" className="pb-16 md:pb-24">
      <Container>
        <h2 id="sporter-rubrik" className="sr-only">
          Välj sport
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SPORTS.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 sm:aspect-[5/4]"
              >
                <Image
                  src={s.image}
                  alt={s.alt}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className={`${s.position} object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
                />
                {/* Scrim för läsbarhet: text ligger alltid på mörk bakgrund, oavsett bild. */}
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
                <div className="relative flex w-full items-end justify-between gap-4 p-6 md:p-8">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[var(--tracking-label)] text-white/70">{s.league}</p>
                    <p className="mt-1 font-heading text-4xl font-bold tracking-display text-white md:text-5xl">{s.title}</p>
                    <p className="mt-2 max-w-[34ch] text-[15px] leading-snug text-white/80">{s.body}</p>
                  </div>
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors duration-150 group-hover:bg-white/25"
                  >
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
