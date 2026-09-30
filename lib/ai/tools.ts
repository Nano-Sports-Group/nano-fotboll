import { SPORT, vertical } from "@/lib/vertical";
import type { Tool } from 'ai'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { searchArticles } from './embedding'
import { resolveTeam } from './resolve'
import { getTeamNameMap } from '@/lib/team-names'

const LEAGUE = vertical.leagueName

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Vertikalens aktuella säsong ur databasen. Tidigare hårdkodad till fotbollens 26806 —
 * hockeyns chatt hade svarat med Allsvenskans tabell.
 */
async function currentSeason(db: SupabaseClient): Promise<{ id: number; label: string } | null> {
  const { data } = await db
    .from('seasons')
    .select('sportmonks_id, name')
    .eq('sport', SPORT)
    .eq('is_current', true)
    .maybeSingle()
  if (!data?.sportmonks_id) return null
  return { id: Number(data.sportmonks_id), label: String(data.name ?? LEAGUE) }
}

// ponytail: cast to Record<string, Tool> — ai@7 tool() helper is UI-only; server tools are plain objects
export const tools: Record<string, Tool> = {
  getRecentNews: {
    description: `Hämta senaste nyheter från idag och igår om ${LEAGUE}, lag eller spelare. Använd alltid detta verktyg när användaren frågar om nyheter, senaste händelser eller vill ha en sammanfattning.`,
    inputSchema: z.object({ keyword: z.string().optional().describe('Lagnamn eller spelares namn att filtrera på') }),
    execute: async ({ keyword }: { keyword?: string }) => {
      try {
        const db = getDb()
        const since = new Date()
        since.setDate(since.getDate() - 2) // senaste 48h
        let q = db
          .from('content_queue')
          .select('title,source_name,source_url,published_at')
          .eq('sport', SPORT)
          .gte('published_at', since.toISOString())
          .order('published_at', { ascending: false })
          .limit(15)
        if (keyword) q = q.ilike('title', `%${keyword}%`)
        const { data } = await q
        if (!data?.length) {
          // Fallback: last 7 days
          const { data: fallback } = await db
            .from('content_queue')
            .select('title,source_name,source_url,published_at')
            .eq('sport', SPORT)
            .ilike('title', keyword ? `%${keyword}%` : '%')
            .order('published_at', { ascending: false })
            .limit(10)
          if (!fallback?.length) return { news: [], message: 'Inga nyheter hittades.' }
          return { news: fallback }
        }
        return { news: data, today: new Date().toLocaleDateString('sv-SE', { timeZone: "Europe/Stockholm" }) }
      } catch (e) {
        return { error: String(e) }
      }
    },
  },

  searchNews: {
    description: 'Sök djupare i artikelarkivet med semantisk sökning. Använd när getRecentNews inte räcker.',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }: { query: string }) => {
      try {
        const results = await searchArticles(query, 5)
        if (!results.length) return { results: [], message: 'Inga artiklar hittades.' }
        return { results: results.map((r) => ({ title: r.title, url: r.url, excerpt: r.chunk.slice(0, 300) })) }
      } catch {
        return { results: [], message: 'Artikelsökning tillfälligt otillgänglig.' }
      }
    },
  },

  getStandings: {
    description: `Hämta aktuell tabellställning i ${LEAGUE}.`,
    inputSchema: z.object({ league: z.string().optional() }),
    execute: async (_args: { league?: string }) => {
      try {
        const db = getDb()
        const season = await currentSeason(db)
        if (!season) return { error: 'Tabelldata saknas.' }
        const { data: stats } = await db
          .from('team_season_stats')
          .select('team_id,played,wins,draws,losses,points,goals_for,goals_against,form')
          .eq('season_id', season.id)
          .order('points', { ascending: false })
          .order('goals_for', { ascending: false })
        if (!stats?.length) return { error: 'Tabelldata saknas.' }

        const nm = await getTeamNameMap(db, stats.map(r => r.team_id))

        return {
          season: season.label,
          standings: stats.map((r, i) => ({
            pos: i + 1,
            team: nm.get(r.team_id)?.name || `Lag ${r.team_id}`,
            played: r.played,
            points: r.points,
            wins: r.wins,
            draws: r.draws,
            losses: r.losses,
            gd: (r.goals_for ?? 0) - (r.goals_against ?? 0),
            form: r.form,
          })),
        }
      } catch (e) {
        return { error: String(e) }
      }
    },
  },

  getTeamStats: {
    description: `Hämta detaljerad statistik för ett lag i ${LEAGUE}.`,
    inputSchema: z.object({ team: z.string() }),
    execute: async ({ team }: { team: string }) => {
      try {
        const teamId = await resolveTeam(team)
        if (!teamId) return { error: `Okänt lag: "${team}". Prova hela lagets namn.` }
        const db = getDb()
        const season = await currentSeason(db)
        if (!season) return { error: 'Statistik saknas.' }

        const { data: stats } = await db
          .from('team_season_stats')
          .select('played,wins,draws,losses,points,goals_for,goals_against,xg_for,xg_against,clean_sheets,form')
          .eq('team_id', teamId)
          .eq('season_id', season.id)
          .maybeSingle()
        if (!stats) return { error: `Ingen statistik för ${team} i ${season.label}.` }

        // Spelardata per match finns bara för fotbollen (Sportmonks). Saknad data visas inte som noll.
        let top_performers: Array<Record<string, unknown>> = []
        if (SPORT === 'football') {
          const { data: topPlayers } = await db
            .from('player_match_stats')
            .select('sportsmonks_player_id,goals,assists,rating,minutes_played')
            .eq('sportsmonks_team_id', teamId)
            .order('goals', { ascending: false })
            .limit(5)
          const playerIds = (topPlayers ?? []).map(p => p.sportsmonks_player_id).filter(Boolean)
          const { data: playerEnts } = playerIds.length
            ? await db.from('entities').select('sportmonks_id,name').eq('sport', SPORT).in('sportmonks_id', playerIds)
            : { data: [] }
          const pnames = new Map((playerEnts ?? []).map(e => [e.sportmonks_id, e.name]))
          top_performers = (topPlayers ?? []).map(p => ({
            name: pnames.get(p.sportsmonks_player_id) ?? `Spelare #${p.sportsmonks_player_id}`,
            goals: p.goals,
            assists: p.assists,
            rating: p.rating,
            minutes: p.minutes_played,
          }))
        }

        return {
          season: season.label,
          team,
          ...stats,
          gd: (stats.goals_for ?? 0) - (stats.goals_against ?? 0),
          ...(top_performers.length ? { top_performers } : {}),
        }
      } catch (e) {
        return { error: String(e) }
      }
    },
  },

  getTopScorers: {
    description: `Hämta ${vertical.scorersLabel.toLowerCase()} och toppspelare i ${LEAGUE}.`,
    inputSchema: z.object({}),
    execute: async () => {
      // Spelarstatistik finns bara för fotbollen. Hockeyns poängliga visas aldrig som fotbollsdata.
      if (SPORT !== 'football') return { error: `${vertical.scorersLabel} saknas i datan än.` }
      try {
        const db = getDb()
        const { data } = await db
          .from('player_match_stats')
          .select('sportsmonks_player_id,sportsmonks_team_id,goals,assists,rating,minutes_played')
          .gt('goals', 0)
          .order('goals', { ascending: false })
          .limit(20)

        if (!data?.length) return { error: 'Ingen skyttedata tillgänglig.' }

        const playerIds = data.map(p => p.sportsmonks_player_id).filter(Boolean)
        const teamIds = [...new Set(data.map(p => p.sportsmonks_team_id).filter(Boolean))]
        const [{ data: pEnts }, { data: tEnts }] = await Promise.all([
          db.from('entities').select('sportmonks_id,name').eq('sport', SPORT).in('sportmonks_id', playerIds),
          db.from('entities').select('sportmonks_id,name').eq('sport', SPORT).in('sportmonks_id', teamIds).eq('type', 'team'),
        ])
        const pn = new Map((pEnts ?? []).map(e => [e.sportmonks_id, e.name]))
        const tn = new Map((tEnts ?? []).map(e => [e.sportmonks_id, e.name]))

        const agg = new Map<number, { goals: number; assists: number; team: string; name: string }>()
        for (const r of data) {
          const id = r.sportsmonks_player_id
          if (!id) continue
          const cur = agg.get(id) ?? { goals: 0, assists: 0, team: tn.get(r.sportsmonks_team_id) ?? '?', name: pn.get(id) ?? `#${id}` }
          cur.goals += r.goals ?? 0
          cur.assists += r.assists ?? 0
          agg.set(id, cur)
        }

        const season = await currentSeason(db)
        return {
          season: season?.label ?? LEAGUE,
          top_scorers: [...agg.values()].sort((a, b) => b.goals - a.goals).slice(0, 10),
        }
      } catch (e) {
        return { error: String(e) }
      }
    },
  },

  getMatch: {
    description: `Hämta matchresultat eller kommande matcher i ${LEAGUE}.`,
    inputSchema: z.object({ team: z.string().optional(), date: z.string().optional() }),
    execute: async ({ team, date }: { team?: string; date?: string }) => {
      try {
        const db = getDb()
        // Kolumnerna heter *_team_name/*_team_id — tidigare valdes home_team/away_team som inte
        // finns, och lagfiltret jämförde ett numeriskt id med uuid-kolumnen: "Inga matcher" varje gång.
        let q = db
          .from('fixtures')
          .select('home_team_name,away_team_name,home_score,away_score,kickoff_at,status')
          .eq('sport', SPORT)
          .order('kickoff_at', { ascending: false })
          .limit(10)

        if (team) {
          const id = await resolveTeam(team)
          if (id) q = q.or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
        }
        if (date) q = q.gte('kickoff_at', date + 'T00:00:00Z').lte('kickoff_at', date + 'T23:59:59Z')

        const { data } = await q
        if (!data?.length) return { error: 'Inga matcher hittades.' }
        const season = await currentSeason(db)
        return { season: season?.label ?? LEAGUE, matches: data }
      } catch (e) {
        return { error: String(e) }
      }
    },
  },
}
