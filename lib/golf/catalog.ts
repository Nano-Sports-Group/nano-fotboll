/**
 * Golfens katalog: tourerna och spelarna ytan är byggd kring, tills resultatdata och intag finns.
 *
 * Varför i kod och inte i databasen: `golf_players` har sex testrader från juni med påhittad
 * världsranking, och `entities` har inga golfrader förrän intaget slås på. Katalogen är det
 * redaktionella urvalet — vilka vi följer — och ersätts inte av datan utan kompletteras av den.
 * Slugarna är desamma som i `golf_players`, så raderna går att koppla ihop senare.
 *
 * Regler:
 * - Bara fakta som inte åldras: land, huvudtour, en daterad merit. Aldrig ranking, form eller
 *   antal segrar — de ändras varje vecka och ska komma ur data, inte ur en fil.
 * - `stars` är ett preliminärt urval. Founder väljer listan; lägg till eller ta bort rader här.
 * - Varje merit ska gå att belägga. Kontrollerade mot källor 2026-10-04: Stark (US Women's Open 2025),
 *   Grant (Scandinavian Mixed 2022), Nordqvist (2009, 2017, 2021), Norén (Ryder Cup 2018), Åberg
 *   (Ryder Cup 2023 och 2025). Övriga är allmänt kända resultat och inte kontrollerade den dagen.
 */

export type TourSlug =
  | "pga-tour"
  | "dp-world-tour"
  | "lpga-tour"
  | "ladies-european-tour"
  | "liv-golf"
  | "majors"
  | "ryder-cup"
  | "solheim-cup";

export interface GolfTour {
  slug: TourSlug;
  name: string;
  /** tour = spelas hela säsongen. event = tävlingar som återkommer. */
  kind: "tour" | "event";
  blurb: string;
}

export const GOLF_TOURS: readonly GolfTour[] = [
  { slug: "pga-tour", name: "PGA Tour", kind: "tour", blurb: "Den amerikanska herrtouren, där de flesta av världens bästa spelar." },
  { slug: "dp-world-tour", name: "DP World Tour", kind: "tour", blurb: "Europatouren för herrar." },
  { slug: "lpga-tour", name: "LPGA Tour", kind: "tour", blurb: "Den amerikanska damtouren, världens största." },
  { slug: "ladies-european-tour", name: "Ladies European Tour", kind: "tour", blurb: "Europatouren för damer." },
  { slug: "liv-golf", name: "LIV Golf", kind: "tour", blurb: "Lagtouren med 54 hål och gemensam start." },
  { slug: "majors", name: "Majors", kind: "event", blurb: "De största tävlingarna: fyra för herrar, fem för damer." },
  { slug: "ryder-cup", name: "Ryder Cup", kind: "event", blurb: "Europa mot USA, herrar, vartannat år." },
  { slug: "solheim-cup", name: "Solheim Cup", kind: "event", blurb: "Europa mot USA, damer, vartannat år." },
];

export interface GolfPlayer {
  slug: string;
  name: string;
  country: string;
  /** Touren spelaren främst spelar på. */
  tour: TourSlug;
  /** swedish = fokus för bevakningen. star = internationella namn vi också följer. */
  group: "swedish" | "star";
  /** En daterad merit — sann i dag och om fem år. */
  merit: string;
}

export const GOLF_PLAYERS: readonly GolfPlayer[] = [
  { slug: "ludvig-aberg", name: "Ludvig Åberg", country: "Sverige", tour: "pga-tour", group: "swedish", merit: "Ryder Cup-vinnare 2023 och 2025" },
  { slug: "alex-noren", name: "Alex Norén", country: "Sverige", tour: "pga-tour", group: "swedish", merit: "Ryder Cup-vinnare 2018" },
  { slug: "henrik-stenson", name: "Henrik Stenson", country: "Sverige", tour: "liv-golf", group: "swedish", merit: "Vann The Open 2016" },
  { slug: "maja-stark", name: "Maja Stark", country: "Sverige", tour: "lpga-tour", group: "swedish", merit: "Vann US Women's Open 2025" },
  { slug: "linn-grant", name: "Linn Grant", country: "Sverige", tour: "lpga-tour", group: "swedish", merit: "Första kvinnan att vinna på DP World Tour, 2022" },
  { slug: "madelene-sagstrom", name: "Madelene Sagström", country: "Sverige", tour: "lpga-tour", group: "swedish", merit: "Solheim Cup-spelare" },
  { slug: "anna-nordqvist", name: "Anna Nordqvist", country: "Sverige", tour: "lpga-tour", group: "swedish", merit: "Majorsegrar 2009, 2017 och 2021" },
  // Preliminärt urval — founder väljer listan.
  { slug: "tiger-woods", name: "Tiger Woods", country: "USA", tour: "pga-tour", group: "star", merit: "15 majorsegrar" },
  { slug: "rory-mcilroy", name: "Rory McIlroy", country: "Nordirland", tour: "pga-tour", group: "star", merit: "Alla fyra majors sedan Masters 2025" },
  { slug: "scottie-scheffler", name: "Scottie Scheffler", country: "USA", tour: "pga-tour", group: "star", merit: "Masters-vinnare 2022 och 2024" },
  { slug: "jon-rahm", name: "Jon Rahm", country: "Spanien", tour: "liv-golf", group: "star", merit: "Vann US Open 2021 och Masters 2023" },
  { slug: "nelly-korda", name: "Nelly Korda", country: "USA", tour: "lpga-tour", group: "star", merit: "OS-guld 2021" },
];

export const getTour = (slug: string): GolfTour | undefined => GOLF_TOURS.find((t) => t.slug === slug);
export const getPlayer = (slug: string): GolfPlayer | undefined => GOLF_PLAYERS.find((p) => p.slug === slug);
export const playersOnTour = (slug: string): GolfPlayer[] => GOLF_PLAYERS.filter((p) => p.tour === slug);
export const swedishPlayers = (): GolfPlayer[] => GOLF_PLAYERS.filter((p) => p.group === "swedish");
export const starPlayers = (): GolfPlayer[] => GOLF_PLAYERS.filter((p) => p.group === "star");
