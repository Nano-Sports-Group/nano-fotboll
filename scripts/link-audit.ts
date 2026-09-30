import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const APP_DIR = './app'
const COMPONENTS_DIR = './components'

interface LinkIssue {
  file: string
  href: string
  issue: string
}

function getAllFiles(dir: string, ext = '.tsx'): string[] {
  const files: string[] = []
  try {
    const items = readdirSync(dir)
    for (const item of items) {
      const full = join(dir, item)
      if (statSync(full).isDirectory()) {
        files.push(...getAllFiles(full, ext))
      } else if (item.endsWith(ext)) {
        files.push(full)
      }
    }
  } catch {
    // dir finns inte
  }
  return files
}

function getRoutes(appDir: string): string[] {
  const routes: string[] = []
  function scan(dir: string, base = '') {
    try {
      const items = readdirSync(dir)
      for (const item of items) {
        const full = join(dir, item)
        if (statSync(full).isDirectory()) {
          const segment = item.startsWith('(') ? '' : `/${item}`
          scan(full, base + segment)
        } else if (item === 'page.tsx') {
          routes.push(base || '/')
        }
      }
    } catch {
      // skip
    }
  }
  scan(appDir)
  return [...new Set(routes)]
}

function extractLinks(file: string): string[] {
  const content = readFileSync(file, 'utf-8')
  const links: string[] = []
  const linkRegex = /href=["'`]([^"'`\n]+)["'`]/g
  let match
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1])
  }
  return links
}

async function main() {
  console.log('🔍 Skannar routes...')
  const routes = getRoutes(APP_DIR)
  console.log(`Hittade ${routes.length} routes:`)
  routes.sort().forEach(r => console.log(`  ${r}`))

  console.log('\n🔍 Analyserar länkar...')
  const files = [
    ...getAllFiles(APP_DIR),
    ...getAllFiles(COMPONENTS_DIR)
  ]

  const issues: LinkIssue[] = []
  const allLinks: string[] = []

  for (const file of files) {
    const links = extractLinks(file)
    for (const href of links) {
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto')) continue
      if (href.includes('${')) continue
      if (href.startsWith('/api/')) continue

      allLinks.push(href)
      const staticHref = href.split('?')[0].split('#')[0]

      const routeMatch = routes.some(route => {
        const routePattern = route
          .replace(/\[+\.\.\..*?\]+/g, '.*')
          .replace(/\[.*?\]/g, '[^/]+')
        const regex = new RegExp(`^${routePattern}$`)
        return regex.test(staticHref) || route === staticHref
      })

      if (!routeMatch) {
        issues.push({ file: file.replace('./', ''), href, issue: 'Route saknas' })
      }
    }
  }

  console.log(`\n📊 Resultat:`)
  console.log(`  Filer analyserade: ${files.length}`)
  console.log(`  Totala länkar: ${allLinks.length}`)
  console.log(`  Brutna länkar: ${issues.length}`)

  if (issues.length > 0) {
    console.log('\n❌ BRUTNA LÄNKAR:')
    const grouped: Record<string, LinkIssue[]> = {}
    for (const i of issues) {
      grouped[i.href] = grouped[i.href] ?? []
      grouped[i.href].push(i)
    }
    for (const [href, list] of Object.entries(grouped)) {
      console.log(`  ${href}`)
      for (const i of list) {
        console.log(`    → ${i.file}`)
      }
    }
  } else {
    console.log('\n✅ Inga brutna länkar hittade!')
  }

  const report = {
    timestamp: new Date().toISOString(),
    routes,
    totalLinks: allLinks.length,
    issues
  }

  writeFileSync(
    'scripts/link-audit-report.json',
    JSON.stringify(report, null, 2)
  )

  console.log('\n📄 Rapport sparad: scripts/link-audit-report.json')

  if (issues.length > 0) process.exit(1)
}

main().catch(console.error)
