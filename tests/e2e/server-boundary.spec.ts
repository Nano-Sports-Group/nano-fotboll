import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Server/klient-gränsen (CLAUDE.md §4: service-role-klienten aldrig i client
 * components).
 *
 * `import "server-only"` i lib/supabase.ts failar bygget om gränsen bryts, men
 * bara när Turbopack råkar spåra kedjan. Det här testet är den explicita
 * vakten: det bygger importgrafen själv och pekar ut den exakta kedjan.
 *
 * Bakgrund: säkerhetsauditen 2026-08-06 hittade service-role-fabriken i fyra
 * klientchunkar i .next/static. Nyckelns värde följde inte med — Next inlinar
 * bara NEXT_PUBLIC_* — men koden låg där, och ett namnbyte hade räckt för att
 * läcka den på riktigt.
 */

const ROOTS = ['app', 'components', 'lib', 'hooks']
/** Moduler som aldrig får nå klientbundlen. */
const SERVER_ONLY = [
  'lib/supabase.ts',
  'lib/user-plan.ts',
  'lib/billing/apply.ts',
  'lib/billing/project.ts',
  'lib/billing/entitlements.ts',
  'lib/app-store.ts',
  'lib/storekit-entitlements.ts',
]

type Graph = {
  imports: Map<string, Set<string>>
  isClient: Map<string, boolean>
  isServerAction: Map<string, boolean>
}

function buildGraph(): Graph {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== '.next') walk(p)
      } else if (/\.tsx?$/.test(name)) {
        files.push(p.replace(/\\/g, '/'))
      }
    }
  }
  for (const r of ROOTS) walk(r)
  const fileset = new Set(files)

  const imports = new Map<string, Set<string>>()
  const isClient = new Map<string, boolean>()
  const isServerAction = new Map<string, boolean>()

  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const head = src.slice(0, 200)
    isClient.set(f, /["']use client["']/.test(head))
    isServerAction.set(f, /["']use server["']/.test(head))

    const deps = new Set<string>()
    for (const line of src.split('\n')) {
      const trimmed = line.trimStart()
      // Typ-importer raderas av kompilatorn och hamnar aldrig i bundlen.
      if (trimmed.startsWith('import type') || trimmed.startsWith('export type')) continue
      const m = line.match(/(?<!type )from\s+["']@\/([^"']+)["']/)
      if (!m) continue
      const base = m[1]
      for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        if (fileset.has(cand)) {
          deps.add(cand)
          break
        }
      }
    }
    imports.set(f, deps)
  }
  return { imports, isClient, isServerAction }
}

const graph = buildGraph()

for (const target of SERVER_ONLY) {
  test(`ingen klientkomponent drar in ${target}`, () => {
    if (!graph.imports.has(target)) test.skip(true, `${target} finns inte`)

    const reverse = new Map<string, Set<string>>()
    for (const [from, deps] of graph.imports) {
      for (const d of deps) {
        if (!reverse.has(d)) reverse.set(d, new Set())
        reverse.get(d)!.add(from)
      }
    }

    const paths = new Map<string, string[]>([[target, [target]]])
    const stack = [target]
    const offenders: string[] = []
    while (stack.length) {
      const cur = stack.pop()!
      for (const parent of reverse.get(cur) ?? []) {
        if (paths.has(parent)) continue
        // Server actions byts ut mot RPC-stubbar på klienten — ingen serverkod
        // följer med, så kedjan bryts här.
        if (graph.isServerAction.get(parent)) continue
        paths.set(parent, [parent, ...paths.get(cur)!])
        stack.push(parent)
        if (graph.isClient.get(parent)) offenders.push(paths.get(parent)!.join(' -> '))
      }
    }

    expect(
      offenders,
      `dessa klientkomponenter drar in ${target} i webbläsarbundlen:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
}
