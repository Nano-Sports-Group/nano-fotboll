import { test, expect } from '@playwright/test'
import { getTeamInk } from '../../lib/team-colors'

/**
 * getTeamInk() ska ge en klubbfärg som klarar WCAG AA som TEXT i båda teman.
 * Kontrastsvepet i contrast.spec.ts ser bara de klubbar som råkar renderas —
 * det här täcker alla klubbar i fotboll och hockey plus fallbacken.
 */
const CLUBS = [
  'aik', 'djurgarden', 'hammarby', 'malmo-ff', 'ifk-goteborg', 'if-elfsborg',
  'bk-hacken', 'sirius', 'halmstad', 'brommapojkarna', 'mjallby', 'degerfors',
  'gais', 'kalmar-ff', 'vasteras-sk', 'orgryte',
  // SHL + HockeyAllsvenskan
  'aik-if', 'djurgardens-if', 'brynas-if', 'farjestads-bk', 'frolunda-hc', 'hv71', 'if-bjorkloven',
  'linkopings-hc', 'lulea-hf', 'malmo-redhawks', 'orebro-hk', 'rogle-bk', 'skelleftea-aik', 'timra-ik',
  'vaxjo-lakers', 'almtuna-is', 'bik-karlskoga', 'ik-oskarshamn', 'kalmar-hc', 'leksands-if',
  'modo-hockey', 'mora-ik', 'nybro-vikings-if', 'ostersunds-ik', 'sodertalje-sk', 'vasteras-ik',
  'vimmerby-hc', 'visby-roma-hk',
  'finns-inte', // fallback
]

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (c: number[]) =>
  c
    .map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4)))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

for (const slug of CLUBS) {
  test(`team-ink ${slug} klarar 4.5:1 i båda teman`, () => {
    const ink = getTeamInk(slug)
    expect(ratio(ink.light, '#FFFFFF'), `${slug} ljust: ${ink.light}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink.light, '#FAFAF8'), `${slug} papper: ${ink.light}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink.light, '#F3F2F0'), `${slug} muted: ${ink.light}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink.dark, '#1B1B1C'), `${slug} mörkt kort: ${ink.dark}`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink.dark, '#000000'), `${slug} mörkt: ${ink.dark}`).toBeGreaterThanOrEqual(4.5)
  })
}
