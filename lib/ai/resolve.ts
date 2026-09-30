import { createClient } from '@supabase/supabase-js'
import { SPORT } from '@/lib/vertical'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Supporternamn → kanoniskt namnfragment, per sport. "Malmö" är MFF i fotboll men Redhawks i hockey.
const TEAM_ALIASES: Record<'football' | 'hockey', Record<string, string>> = {
  football: {
    bajen: 'Hammarby',
    djurgarn: 'Djurgårdens',
    gnaget: 'AIK',
    blavitt: 'IFK Göteborg',
    efk: 'IFK Göteborg',
    ifk: 'IFK',
    mff: 'Malmö FF',
    malmo: 'Malmö FF',
    hbk: 'Halmstads BK',
    hacken: 'BK Häcken',
    sirius: 'IK Sirius',
    kalmar: 'Kalmar FF',
    elfsborg: 'IF Elfsborg',
    norrkoping: 'IFK Norrköping',
    orebro: 'Örebro SK',
    varberg: 'Varbergs BoIS',
    mjallby: 'Mjällby AIF',
    degerfors: 'Degerfors IF',
    brommapojkarna: 'Brommapojkarna',
    bp: 'Brommapojkarna',
  },
  hockey: {
    djurgarn: 'Djurgårdens',
    dif: 'Djurgårdens',
    malmo: 'Malmö Redhawks',
    redhawks: 'Malmö Redhawks',
    fbk: 'Färjestads',
    farjestad: 'Färjestads',
    frolunda: 'Frölunda',
    lhc: 'Linköpings',
    linkoping: 'Linköpings',
    lulea: 'Luleå',
    orebro: 'Örebro HK',
    rogle: 'Rögle',
    skelleftea: 'Skellefteå',
    timra: 'Timrå',
    vaxjo: 'Växjö',
    bjorkloven: 'Björklöven',
    brynas: 'Brynäs',
  },
}

function normalize(s: string) {
  return s.toLowerCase().trim().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
}

/** Lagets Sportmonks-/Sportradar-id i den här vertikalen — aldrig ett lag i en annan sport. */
export async function resolveTeam(name: string): Promise<number | null> {
  const db = getDb()
  const aliasMatch = TEAM_ALIASES[SPORT][normalize(name)]
  const searchTerm = aliasMatch ?? name

  const { data } = await db
    .from('entities')
    .select('sportmonks_id, name')
    .eq('type', 'team')
    .eq('sport', SPORT)
    .ilike('name', `%${searchTerm}%`)
    .not('sportmonks_id', 'is', null)
    .limit(1)

  return data?.[0]?.sportmonks_id ?? null
}
