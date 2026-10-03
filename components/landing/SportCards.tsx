import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Container } from "./primitives";

/**
 * Sportväljaren under heron: Nano är flera sporter, fotbollen först, golfen sist (ytan finns, bevakningen byggs).
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
  {
    key: "golf",
    title: "Golf",
    league: "Tourerna",
    body: "Svenska spelare och de stora tourerna. Bevakningen byggs.",
    href: "https://golf.nanosport.se/golf",
    // Ingen bild än: kortet ritas (GolfGround). Lägg public/landing/sport-golf.jpg och fyll i image + alt.
    image: null,
    alt: "",
    position: "",
  },
] as const;

/** Golfkortets bakgrund tills det finns ett foto: Racing Green med banans höjdkurvor. */
function GolfGround() {
  return (
    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_15%,#3d6d60_0%,#1d3830_45%,#0a1512_100%)]">
      <svg className="absolute inset-0 h-full w-full opacity-40 transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#7cc4a6" strokeWidth="1">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <ellipse key={i} cx={270 - i * 6} cy={95 + i * 5} rx={26 + i * 30} ry={14 + i * 19} transform={`rotate(${-18 + i * 2} 270 95)`} opacity={1 - i * 0.11} />
        ))}
        <circle cx="270" cy="95" r="3" fill="#f5f5f2" stroke="none" />
      </svg>
    </div>
  );
}

export function SportCards() {
  return (
    <section aria-labelledby="sporter-rubrik" className="pb-16 md:pb-24">
      <Container>
        <h2 id="sporter-rubrik" className="sr-only">
          Välj sport
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPORTS.map((s, i) => (
            // Tre kort i två kolumner: det sista får hela raden i stället för att hänga ensamt till vänster.
            <li key={s.key} className={i === SPORTS.length - 1 ? "sm:col-span-2 lg:col-span-1" : undefined}>
              <Link
                href={s.href}
                className={`group relative flex aspect-[4/3] items-end overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-pitch focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  i === SPORTS.length - 1 ? "sm:aspect-[5/2] lg:aspect-[5/4]" : "sm:aspect-[5/4]"
                }`}
              >
                {s.image ? (
                  <Image
                    src={s.image}
                    alt={s.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className={`${s.position} object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
                  />
                ) : (
                  <GolfGround />
                )}
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
