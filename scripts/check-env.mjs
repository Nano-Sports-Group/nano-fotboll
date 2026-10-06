#!/usr/bin/env node
/**
 * Kontrollerar att kritiska env-variabler FINNS i Vercel.
 *
 * VIKTIG BEGRÄNSNING — läs innan du tolkar utdata:
 * Vercel gör env-variabler **sensitive by default på Production**. En sensitive
 * variabel kan inte läsas tillbaka; `vercel env pull` skriver den som tom sträng.
 * Tom i pull betyder alltså INTE tom i Vercel.
 *
 * Verifierat 2026-08-12 med två probe-variabler i produktion:
 *   vercel env add PROBE production --value=OPPEN123 --no-sensitive  → pull ger "OPPEN123"
 *   vercel env add PROBE production --value=HEMLIG123                → pull ger ""
 *
 * En tidigare version av detta skript tolkade den tomheten som "21 variabler är
 * tomma i produktion" och pekade ut CLERK_WEBHOOK_SECRET, UPSTASH och VAPID som
 * trasiga. Det var fel. Skriptet kan bara verifiera VÄRDET på icke-sensitive
 * variabler; för resten kan det bara verifiera att namnet existerar.
 *
 * Den ursprungliga felklassen finns fortfarande på riktigt (CLAUDE.md: "tom
 * sträng i Vercel env — `??` faller inte tillbaka på `''`", vilket sänkte
 * ATHOPIA_OS_URL i admin). Men den kan inte upptäckas med `env pull` för
 * sensitive variabler. Enda pålitliga vägen är runtime: logga vid uppstart när
 * en obligatorisk variabel är tom, där koden faktiskt läser den.
 *
 * Kör:  node scripts/check-env.mjs [production|preview]
 * Exit 1 om en kritisk variabel SAKNAS, eller om en icke-sensitive variabel är tom.
 * LAUNCH_REQUIRED varnar men failar ALDRIG — se nedan.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENVIRONMENT = process.argv[2] ?? 'production';

/** Fylls av Vercel vid build. Tomma lokalt är korrekt. */
const BUILD_TIME = /^(VERCEL_URL$|VERCEL_GIT_)/;

/** Måste finnas, annars är en funktion trasig i produktion. */
const REQUIRED = [
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
];

/**
 * Behövs för att slå PÅ waitlisten — men inte för att deploya produkten.
 *
 * Skillnaden är hela poängen: saknas de här är kön avstängd, och en avstängd kö
 * är ett giltigt tillstånd (det är tillståndet i dag). Att låta dem blockera
 * bygget hade gjort det omöjligt att deploya något annat innan Hampus skaffat
 * ett Resend-konto.
 *
 * WAITLIST_MODE saknas  = kön är av. Korrekt i dag.
 * RESEND_API_KEY saknas = inget bekräftelsemejl går ut. `lib/waitlist/email.ts`
 *                         svarar 503 i stället för att låtsas att mejlet skickades,
 *                         så raden ligger kvar som pending_confirm med giltig token.
 */
const LAUNCH_REQUIRED = ['RESEND_API_KEY', 'WAITLIST_EMAIL_FROM', 'WAITLIST_MODE'];

/**
 * Google Play-köp (docs/billing). Varnar men failar ALDRIG: saknas de svarar
 * /api/webhooks/google-play och /api/google-play/purchases 503 — Android säljer inget än.
 */
const WARN_ONLY = ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PLAY_PACKAGE_NAME', 'GOOGLE_PLAY_RTDN_TOKEN'];

/**
 * Publika till sin natur, alltså meningslösa att göra sensitive — och därför de
 * enda vars VÄRDE går att kontrollera härifrån. Sätt dem med `--no-sensitive`.
 */
const MUST_BE_READABLE = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'];

const tmp = join(tmpdir(), `athopia-env-${Date.now()}.env`);
try {
  execFileSync(
    'npx',
    ['--yes', 'vercel', 'env', 'pull', tmp, `--environment=${ENVIRONMENT}`, '--yes'],
    { stdio: 'pipe', shell: process.platform === 'win32' },
  );
} catch (err) {
  console.error(`Kunde inte hämta env från Vercel: ${err.message}`);
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(tmp, 'utf8');
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* redan borta */
  }
}

const values = new Map();
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) values.set(m[1], m[2].replace(/^"|"$/g, '').trim());
}

const missing = REQUIRED.filter((k) => !values.has(k));
const launchMissing = LAUNCH_REQUIRED.filter((k) => !values.has(k));
const warnMissing = WARN_ONLY.filter((k) => !values.has(k));
const readableButEmpty = MUST_BE_READABLE.filter((k) => values.has(k) && values.get(k) === '');
const unverifiable = REQUIRED.filter(
  (k) => values.has(k) && values.get(k) === '' && !MUST_BE_READABLE.includes(k),
);
const otherPresent = [...values.keys()].filter(
  (k) => !REQUIRED.includes(k) && !BUILD_TIME.test(k) && values.get(k) === '',
);

console.log(`Miljö: ${ENVIRONMENT} — ${values.size} variabler\n`);

if (missing.length) {
  console.log('SAKNAS HELT — funktionen är trasig:');
  for (const k of missing) console.log(`  ${k}`);
  console.log('');
}

if (launchMissing.length) {
  console.log('VARNING — saknas, men blockerar inte deploy (waitlisten är av tills de finns):');
  for (const k of launchMissing) console.log(`  ${k}`);
  console.log('  → Utan RESEND_API_KEY skickas inget bekräftelsemejl (route svarar 503).');
  console.log('  → Utan WAITLIST_MODE är kön avstängd. Det är korrekt tills Hampus slår på den.');
  console.log('');
}

if (warnMissing.length) {
  console.log('VARNING — Google Play-variabler saknas (rutterna svarar 503 tills de finns):');
  for (const k of warnMissing) console.log(`  ${k}`);
  console.log('');
}

if (readableButEmpty.length) {
  console.log('TOM trots att den ska vara läsbar (NEXT_PUBLIC_*, sätt med --no-sensitive):');
  for (const k of readableButEmpty) console.log(`  ${k}`);
  console.log('');
}

console.log(`Finns men går inte att verifiera härifrån (sensitive): ${unverifiable.length}`);
console.log(`Övriga sensitive/tomma: ${otherPresent.length}`);
console.log('\nSensitive-värden kan bara verifieras i runtime, inte via `env pull`.');

if (missing.length || readableButEmpty.length) process.exit(1);
process.exit(0);
