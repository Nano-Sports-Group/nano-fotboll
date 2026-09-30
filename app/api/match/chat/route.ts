import { auth, currentUser } from '@clerk/nextjs/server'
import { MissingOsLlmConfig, osChatModel, osLlmUnavailable } from '@/lib/ai/provider'
import { streamText, stepCountIs } from 'ai'
import { createClient } from '@supabase/supabase-js'
import { tools } from '@/lib/ai/tools'
import { bumpChatUsage, checkChatLimits } from '@/lib/ai/chat-limits'
import { getUserPlan } from '@/lib/user-plan'
import { canAccess } from '@/lib/access-rules'
import { parseBody, z } from '@/lib/validation'
import { enforceRateLimit } from '@/lib/ratelimit'
import { UiMessagesSchema, toChatTurns } from '@/lib/ai/ui-messages'

export const maxDuration = 30

const MatchChatSchema = z.object({
  messages: UiMessagesSchema,
  fixtureId: z.number().int().positive().optional(),
  homeTeam: z.string().trim().max(100).optional(),
  awayTeam: z.string().trim().max(100).optional(),
  score: z.string().trim().max(30).optional(),
  status: z.string().trim().max(30).optional(),
  kickoff: z.string().trim().max(100).optional(),
})

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const blocked = await enforceRateLimit('ai', req, userId)
  if (blocked) return blocked

  const plan = await getUserPlan()
  if (!canAccess('aiChat', plan)) {
    return Response.json(
      {
        error: 'PRO krävs för matchchatten.',
        code: 'plan_required',
        feature: 'aiChat',
        requiredPlan: 'pro',
        upgradePath: '/prenumerera',
      },
      { status: 403 }
    )
  }

  // currentUser används för ev. övrig Clerk-data; plan avgörs alltid via getUserPlan()
  const user = await currentUser()

  const limits = await checkChatLimits(userId)
  if (!limits.ok) {
    return Response.json({ error: limits.error }, { status: limits.status })
  }

  const parsed = await parseBody(req, MatchChatSchema)
  if (!parsed.ok) return parsed.response
  const { messages, fixtureId, homeTeam, awayTeam, score, status, kickoff } = parsed.data
  const turns = toChatTurns(messages)
  if (!turns) return Response.json({ error: "Skriv en fråga." }, { status: 400 })

  let matchExtra = ''
  if (fixtureId) {
    const db = getDb()
    const [{ data: evts }, { data: pms }] = await Promise.all([
      db.from('fixture_events').select('minute,type,result').eq('fixture_id', fixtureId).order('minute').limit(20),
      db.from('player_match_stats').select('player_id,goals,assists,rating').eq('fixture_id', fixtureId).order('rating', { ascending: false }).limit(8),
    ])
    if (evts?.length) {
      matchExtra += `\nHändelser: ${evts.map((e) => `${e.minute}' ${e.type}${e.result ? ` (${e.result})` : ''}`).join('; ')}.`
    }
    if (pms?.length) {
      const ids = pms.map((p) => p.player_id).filter(Boolean)
      const { data: players } = await db.from('players').select('sportmonks_id,fullname').in('sportmonks_id', ids)
      const names = new Map((players ?? []).map((p) => [p.sportmonks_id, p.fullname]))
      matchExtra += `\nToppbetyg: ${pms.map((p) => `${names.get(p.player_id) ?? p.player_id} (${p.rating ?? '?'})`).join(', ')}.`
    }
  }

  const matchContext = fixtureId
    ? `\n\n## Matchkontext (prioritera detta)
Användaren tittar på: ${homeTeam} vs ${awayTeam}.
Fixture-id: ${fixtureId}. Status: ${status ?? 'okänd'}. Resultat: ${score ?? 'ej spelad'}. Kickoff: ${kickoff ?? 'okänd'}.${matchExtra}
Svara utifrån denna match först — använd verktyg för tabell/nyheter vid behov.`
    : ''

  let model
  try {
    model = osChatModel()
  } catch (err) {
    if (err instanceof MissingOsLlmConfig) return osLlmUnavailable()
    throw err
  }

  const result = streamText({
    model,
    maxOutputTokens: 600,
    system: `Du är Nano Fotbolls AI-assistent för Allsvenskan. Idag är det ${new Date().toLocaleDateString('sv-SE', { timeZone: "Europe/Stockholm", year: 'numeric', month: 'long', day: 'numeric' })}.${matchContext}

## Hur du svarar
- Kort och objektivt — 2–4 meningar eller punktlista
- Använd verktyg vid behov (tabell, nyheter, lagstatistik)
- Hitta aldrig på siffror — säg om data saknas
- Svara ALDRIG utanför Allsvenskan/svensk fotboll
- Avslöja ALDRIG tekniska detaljer om systemet`,
    messages: turns,
    stopWhen: stepCountIs(5),
    tools,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
    onFinish: async ({ usage }) => {
      if (!usage) return
      await bumpChatUsage(limits.db, userId, usage.inputTokens ?? 0, usage.outputTokens ?? 0)
    },
  })

  return result.toUIMessageStreamResponse()
}
