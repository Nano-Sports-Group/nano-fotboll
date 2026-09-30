import { SPORT } from "@/lib/vertical";
import { unstable_cache } from 'next/cache'
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase'
import { fetchStandingsFull } from '@/lib/db/fixtures'
import type { DashTeam, DashArticle, DashThread, DashStanding, DashStatPoint } from './types'


// ── User-specifik (färsk per request) ─────────────────────────────────────────

export async function getFollowedTeams(userId: string): Promise<DashTeam[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('user_follows')
      .select('entities ( id, name, slug, metadata )')
      .eq('user_id', userId)
      .eq('sport', SPORT)
      .order('created_at', { ascending: true })
    if (!data) return []
    type FollowRow = { entities: { id: string; name: string; slug: string; metadata: Record<string, unknown> | null } | null }
    return (data as unknown as FollowRow[])
      .map((r) => {
        const e = r.entities
        if (!e) return null
        const meta = (e.metadata ?? {}) as Record<string, unknown>
        return {
          id: String(e.id),
          name: String(e.name),
          slug: String(e.slug),
          logo_url: (meta.logo_url as string | null) ?? null,
        }
      })
      .filter(Boolean) as DashTeam[]
  } catch {
    return []
  }
}

export async function getTeamBySlug(slug: string): Promise<DashTeam | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('entities')
      .select('id, name, slug, metadata')
      .eq('type', 'team')
      .eq('sport', SPORT)
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return null
    const row = data as { id: string; name: string; slug: string; metadata: Record<string, unknown> | null }
    const meta = row.metadata ?? {}
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      logo_url: (meta.logo_url as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export async function followTeam(userId: string, entityId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const supabase = createServerClient()
    await supabase.from('user_follows').upsert(
      { user_id: userId, entity_id: entityId, sport: SPORT },
      { onConflict: 'user_id,entity_id' }
    )
  } catch {
    // swallow
  }
}

export async function unfollowTeam(userId: string, entityId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const supabase = createServerClient()
    await supabase
      .from('user_follows')
      .delete()
      .eq('user_id', userId)
      .eq('entity_id', entityId)
  } catch {
    // swallow
  }
}

// ── Delad lagdata (cachad 60s, delas mellan användare) ────────────────────────

async function fetchTeamNews(teamSlug: string): Promise<DashArticle[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = createServerClient()
    const { data: team } = await supabase
      .from('entities')
      .select('id')
      .eq('type', 'team')
      .eq('sport', SPORT)
      .eq('slug', teamSlug)
      .maybeSingle()
    if (!team?.id) return []

    const { data } = await supabase
      .from('articles')
      .select('id, title, slug, summary, published_at, rights_status, is_athopia_generated')
      .eq('sport', SPORT)
      .eq('status', 'published')
      .contains('entity_ids', [String(team.id)])
      .order('published_at', { ascending: false })
      .limit(5)
    type NewsRow = { id: string; title: string; slug: string | null; summary: string | null; published_at: string; rights_status: string | null; is_athopia_generated: boolean | null }
    return ((data ?? []) as NewsRow[]).map((r) => {
      const rights = r.rights_status ?? (r.is_athopia_generated ? 'owned' : 'link_only')
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        summary: rights === 'owned' || rights === 'licensed' ? r.summary : null,
        published_at: r.published_at,
        image_url: null,
        rights_status: rights,
      }
    }) as DashArticle[]
  } catch {
    return []
  }
}

// Cache-nyckeln MÅSTE innehålla teamSlug — annars delar alla lag samma
// cache-slot (bara det först anropade lagets nyheter returneras för alla).
export async function getTeamNews(teamSlug: string): Promise<DashArticle[]> {
  return unstable_cache(fetchTeamNews, ['dash-news', teamSlug], {
    revalidate: 60,
    tags: ['articles'],
  })(teamSlug)
}

async function fetchTeamThreads(teamId: string): Promise<DashThread[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('forum_threads')
      .select('id, title, reply_count, view_count, created_at')
      .eq('team_id', teamId)
      .order('last_reply_at', { ascending: false })
      .limit(6)
    return (data as DashThread[]) ?? []
  } catch {
    return []
  }
}

// Samma cache-nyckel-bugg som getTeamNews — teamId måste vara med i nyckeln.
export async function getTeamThreads(teamId: string): Promise<DashThread[]> {
  return unstable_cache(fetchTeamThreads, ['dash-threads', teamId], {
    revalidate: 60,
    tags: ['forum_threads'],
  })(teamId)
}

export const getStandings = unstable_cache(
  async (): Promise<DashStanding[]> => {
    try {
      const full = await fetchStandingsFull()
      return full.slice(0, 16).map((r) => ({
        position: r.position,
        team_name: r.team.name,
        team_slug: String(r.team.short_code ?? r.team.name).toLowerCase().replace(/\s+/g, '-'),
        played: r.played,
        points: r.points,
        goal_diff: r.goal_diff,
      }))
    } catch {
      return []
    }
  },
  ['dash-standings'],
  { revalidate: 300, tags: ['standings'] }
)

export const getTeamStats = unstable_cache(
  async (teamId: string): Promise<DashStatPoint[]> => {
    if (!isSupabaseConfigured()) return []
    try {
      const supabase = createServerClient()
      const { data } = await supabase
        .from('match_stats')
        .select('matchday_label, goals_for, goals_against, played_at')
        .eq('sport', SPORT)
        .eq('entity_id', teamId)
        .order('played_at', { ascending: false })
        .limit(5)
      if (!data?.length) return []
      return [...data].reverse().map((r) => ({
        label: String(r.matchday_label ?? ''),
        goals_for: Number(r.goals_for ?? 0),
        goals_against: Number(r.goals_against ?? 0),
      }))
    } catch {
      return []
    }
  },
  ['dash-stats'],
  { revalidate: 60, tags: ['match_stats'] }
)
