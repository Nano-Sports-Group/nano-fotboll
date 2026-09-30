'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import type { GamificationState } from '@/lib/gamification/types'

/**
 * Loads gamification via authenticated API (service role on server).
 * Does not open user tables to the browser anon key.
 */
export function useGamification(): GamificationState {
  const { user, isLoaded } = useUser()
  const [state, setState] = useState<GamificationState>({
    league: null,
    iq: null,
    currentRoundRing: null,
    streak: null,
    recentCards: [],
    badges: [],
    isLoading: true,
    loadError: null,
  })

  useEffect(() => {
    if (!isLoaded || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
      setState(prev => ({ ...prev, isLoading: false, loadError: null }))
      return
    }

    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/gamification/state')
        if (!res.ok) {
          if (!cancelled) {
            setState(prev => ({
              ...prev,
              isLoading: false,
              loadError:
                res.status === 401
                  ? 'Logga in igen för att se din liga.'
                  : 'Kunde inte ladda ligan just nu. Försök igen om en stund.',
            }))
          }
          return
        }
        const data = (await res.json()) as {
          league: GamificationState['league']
          iq: GamificationState['iq']
          currentRoundRing: GamificationState['currentRoundRing']
          streak: GamificationState['streak']
          recentCards: GamificationState['recentCards']
          badges: GamificationState['badges']
        }
        if (!cancelled) {
          setState({
            league: data.league,
            iq: data.iq,
            currentRoundRing: data.currentRoundRing,
            streak: data.streak,
            recentCards: data.recentCards ?? [],
            badges: data.badges ?? [],
            isLoading: false,
            loadError: null,
          })
        }
      } catch {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            loadError: 'Kunde inte ladda ligan just nu. Försök igen om en stund.',
          }))
        }
      }
    }

    void load()
    // Poll lightly instead of Realtime on user tables (keeps anon out of RLS surface).
    const interval = window.setInterval(() => void load(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [user, isLoaded])

  return state
}
