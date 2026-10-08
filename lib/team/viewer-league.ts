import "server-only";
import { fetchLeaguesWithData } from "@/lib/db/fixtures";
import { getPrimaryTeam } from "@/lib/team/getPrimaryTeam";
import { pickViewerLeague } from "@/lib/vertical";

/**
 * Vilken serie ligasidorna ska visa. Hemligan är favoritlagets liga och väljs aldrig av användaren:
 * utan `?liga=` hamnar man alltid där, och växlaren är bara till för att titta runt. Ingenting sparas,
 * så nästa besök börjar rätt igen. Gäster och lag i huvudligan får huvudligan, som förut.
 */
export async function resolveViewerLeague(param: string | string[] | undefined) {
  const homeName = (await getPrimaryTeam().catch(() => null))?.league ?? null;
  return pickViewerLeague(param, homeName, homeName ? await fetchLeaguesWithData() : []);
}
