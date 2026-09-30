'use client'

import { useEffect, useState } from 'react'
import { getTeamAccent } from '@/lib/team-colors'

type League = { id: string; team_slug: string; team_name: string }

/** Lagen kommer från servern (vertikalens nuvarande lag) — inte en hårdkodad lista. */
export function OnboardingLeaguePicker({ onComplete }: { onComplete: () => void }) {
  const [leagues, setLeagues] = useState<League[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/gamification/league')
      .then((r) => r.json() as Promise<{ leagues?: League[] }>)
      .then((d) => { if (alive) setLeagues(d.leagues ?? []) })
      .catch(() => { if (alive) setLeagues([]) })
    return () => { alive = false }
  }, [])

  async function joinLeague() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/gamification/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamSlug: selected }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Kunde inte gå med i ligan. Försök igen.')
        return
      }
      onComplete()
    } catch {
      setError('Ingen anslutning. Försök igen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="text-2xl font-black text-white text-balance">Välj ditt lag</h2>
          <p className="text-white/50 text-sm mt-1">
            Du tävlar mot andra fans av samma lag. Välj klokt.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {leagues === null && <p className="col-span-3 text-sm text-white/50">Hämtar lag…</p>}
          {leagues?.length === 0 && (
            <p className="col-span-3 text-sm text-white/50">Fan-ligor finns inte för den här sporten än.</p>
          )}
          {leagues?.map(team => (
            <button
              key={team.team_slug}
              onClick={() => setSelected(team.team_slug)}
              className={`rounded-lg border p-3 text-center transition-all ${
                selected === team.team_slug
                  ? 'border-pitch bg-pitch/10 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full mx-auto mb-1"
                style={{ backgroundColor: getTeamAccent(team.team_slug) }}
              />
              <span className="text-xs font-semibold">{team.team_name}</span>
            </button>
          ))}
        </div>

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

        <button
          onClick={joinLeague}
          disabled={!selected || saving}
          className="w-full py-3 rounded-lg bg-pitch text-white font-bold disabled:opacity-40 transition-opacity"
        >
          {saving ? 'Sparar...' : 'Gå med i ligan →'}
        </button>
      </div>
    </div>
  )
}
