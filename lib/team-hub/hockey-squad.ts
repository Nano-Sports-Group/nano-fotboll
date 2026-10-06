/**
 * lib/team-hub/hockey-squad.ts — hockeylagets trupp.
 *
 * Källor (alla skrivna av nano-os hockeysynk från Sportradar):
 *   players              namn, position, födelsedatum, längd, vikt
 *   player_season_stats  mål, assist, skott på mål
 *   fixture_lineups      tröjnummer (senaste matchen spelaren stod i uppställningen)
 *
 * Matcher och minuter finns inte i källan och visas därför inte — aldrig som noll.
 * ponytail: antal matcher går att räkna ur fixture_lineups när alla säsongens matcher är hämtade.
 */

import "server-only";
import { createServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { SPORT } from "@/lib/vertical";
import { seasonIdForTeam } from "@/lib/team-hub/queries";
import { ageOn } from "@/lib/team-hub/hockey-squad-age";

export type HockeyGroup = "Målvakter" | "Backar" | "Forwards" | "Övriga";

export interface HockeySquadRow {
  playerId: number;
  name: string;
  group: HockeyGroup;
  jersey: number | null;
  age: number | null;
  height: number | null;
  weight: number | null;
  /** null = spelaren har ingen statistikrad (t.ex. målvakter), inte noll. */
  goals: number | null;
  assists: number | null;
  shotsOnTarget: number | null;
}

const GROUP: Record<string, HockeyGroup> = { Målvakt: "Målvakter", Back: "Backar", Forward: "Forwards" };
export const HOCKEY_GROUP_ORDER: HockeyGroup[] = ["Målvakter", "Backar", "Forwards", "Övriga"];

export async function getHockeySquad(teamSmId: number | null): Promise<HockeySquadRow[]> {
  if (!teamSmId || !isSupabaseConfigured()) return [];
  const db = createServerClient();
  const seasonId = await seasonIdForTeam(teamSmId);
  const [{ data: players, error }, { data: stats }, { data: lineups }] = await Promise.all([
    db.from("players").select("sportmonks_id,fullname,position,birthdate,height,weight").eq("sport", SPORT).eq("team_id", teamSmId),
    db.from("player_season_stats").select("player_id,goals,assists,shots_on_target").eq("team_id", teamSmId).eq("season_id", seasonId),
    // Senaste matcherna först: första träffen per spelare är aktuellt tröjnummer.
    db.from("fixture_lineups").select("player_id,jersey,fixture_id").eq("team_id", teamSmId).order("fixture_id", { ascending: false }).limit(400),
  ]);
  if (error) {
    console.error("[hockey-squad]", error.message);
    return [];
  }

  const statById = new Map((stats ?? []).map((s) => [Number(s.player_id), s]));
  const jerseyById = new Map<number, number>();
  for (const l of lineups ?? []) {
    const id = Number(l.player_id);
    if (l.jersey != null && !jerseyById.has(id)) jerseyById.set(id, Number(l.jersey));
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

  return (players ?? [])
    .map((p): HockeySquadRow => {
      const id = Number(p.sportmonks_id);
      const s = statById.get(id);
      return {
        playerId: id,
        name: String(p.fullname ?? ""),
        group: GROUP[String(p.position ?? "")] ?? "Övriga",
        jersey: jerseyById.get(id) ?? null,
        age: ageOn(p.birthdate as string | null, today),
        height: p.height ? Number(p.height) : null,
        weight: p.weight ? Number(p.weight) : null,
        goals: s ? Number(s.goals ?? 0) : null,
        assists: s ? Number(s.assists ?? 0) : null,
        shotsOnTarget: s?.shots_on_target != null ? Number(s.shots_on_target) : null,
      };
    })
    .filter((r) => r.name)
    .sort(
      (a, b) =>
        HOCKEY_GROUP_ORDER.indexOf(a.group) - HOCKEY_GROUP_ORDER.indexOf(b.group) ||
        (b.goals ?? -1) + (b.assists ?? 0) - ((a.goals ?? -1) + (a.assists ?? 0)) ||
        (a.jersey ?? 999) - (b.jersey ?? 999) ||
        a.name.localeCompare(b.name, "sv"),
    );
}
