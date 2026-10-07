'use server'

import { SPORT } from "@/lib/vertical";
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase'


type Result = { ok: boolean; following?: boolean; error?: string }

/**
 * Följda lag ger uppdateringar i flödet — de äger aldrig temat eller "Mitt lag"
 * (det gör favoritlaget). Taket håller flödet till "mina lag" i stället för alla lag.
 */
const MAX_FOLLOWED_TEAMS = 5

export async function toggleFollow(entityId: string): Promise<Result> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: 'unauthorized' }
  if (!isSupabaseConfigured()) return { ok: false, error: 'not_configured' }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('user_follows')
    .select('id')
    .eq('user_id', userId)
    .eq('entity_id', entityId)
    .eq('sport', SPORT)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/dashboard')
    revalidatePath('/profil')
    return { ok: true, following: false }
  }

  // Bara lag i den här sporten går att följa — id:t kommer från klienten.
  const { data: team } = await supabase
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('type', 'team')
    .eq('sport', SPORT)
    .maybeSingle()
  if (!team) return { ok: false, error: 'unknown_team' }

  const { count } = await supabase
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('sport', SPORT)
  if ((count ?? 0) >= MAX_FOLLOWED_TEAMS) return { ok: false, error: 'limit' }

  const { error } = await supabase
    .from('user_follows')
    .insert({ user_id: userId, entity_id: entityId, sport: SPORT })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/dashboard')
  return { ok: true, following: true }
}

export async function isFollowing(entityId: string): Promise<boolean> {
  const { userId } = await auth()
  if (!userId || !isSupabaseConfigured()) return false
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('user_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('sport', SPORT)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}
