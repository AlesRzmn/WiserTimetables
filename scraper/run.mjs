// Zažene se v GitHub Actionu (ali lokalno: `npm run scrape`).
// Prebere urnike vseh fakultet in jih zapiše v public/data/ za spletno aplikacijo.
//
// Okoljske spremenljivke:
//   OUT_DIR         kam zapisati podatke (privzeto public/data)
//   PREV_DATA_URL   naslov že objavljenih podatkov (npr. https://ime.github.io/um-urnik/data),
//                   iz katerega se vzame prejšnje stanje za zaznavanje sprememb
//   FACULTIES       seznam kratic, ločen z vejicami (privzeto vse)
//   CATALOG_MAX_AGE_H  kako pogosto na novo prebrati programe/skupine (privzeto 20 ur)

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseHTML as linkedomParse } from 'linkedom'
import {
  FACULTIES, resolveSchoolCode, fetchCatalog, fetchEvents, packEvents, unpackEvents, diffEvents,
} from './core.mjs'

const OUT_DIR = process.env.OUT_DIR || 'public/data'
const PREV = (process.env.PREV_DATA_URL || '').replace(/\/$/, '')
const ONLY = (process.env.FACULTIES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const CATALOG_MAX_AGE_H = Number(process.env.CATALOG_MAX_AGE_H || 20)
const CHANGES_KEEP_DAYS = 21
const UA = 'um-urnik (odprtokodni pregledovalnik urnikov UM; GitHub Action, nekajkrat na dan)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const delay = () => sleep(250) // vljudno do strežnika

async function fetchText(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return await res.text()
    } catch (e) {
      if (i >= tries) throw e
      await sleep(2000 * i)
    }
  }
}
async function fetchFinalUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  return res.ok ? res.url : null
}
const parseHTML = (html) => linkedomParse(html).document

async function fetchPrevJson(path) {
  if (!PREV) return null
  try {
    const res = await fetch(`${PREV}/${path}`, { headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function writeJson(path, data) {
  const full = join(OUT_DIR, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, JSON.stringify(data))
}

/** "YYYY-MM-DDTHH:MM" po ljubljanskem času. */
function localNow(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400e3)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

async function scrapeFaculty(key, prevMeta) {
  const ctx = { fetchText, parseHTML, fetchFinalUrl, delay }
  const prevEntry = prevMeta?.faculties?.find((f) => f.key === key)
  const code = prevEntry?.code || (await resolveSchoolCode(key, ctx))
  if (!code) throw new Error('kode fakultete ni bilo mogoče najti (Wise nedosegljiv ali fakulteta nima javnega urnika)')

  // --- katalog (redkeje) ---
  const now = new Date().toISOString()
  let catalog = null
  const age = prevEntry?.catalogAt ? (Date.now() - Date.parse(prevEntry.catalogAt)) / 3600e3 : Infinity
  if (age < CATALOG_MAX_AGE_H) catalog = await fetchPrevJson(`${key}/catalog.json`)
  if (!catalog) {
    console.log(`  katalog …`)
    catalog = { ...(await fetchCatalog(code, ctx)), fetchedAt: now }
  }
  if (!catalog.groups.length) throw new Error('ni najdenih skupin')

  // --- dogodki ---
  console.log(`  dogodki za ${catalog.groups.length} skupin …`)
  const events = await fetchEvents(code, catalog, ctx)
  const keepFrom = localNow(-30) // starejših dogodkov aplikacija ne rabi
  const kept = events.filter((e) => e.end >= keepFrom)

  // --- primerjava s prejšnjim stanjem ---
  const prevPacked = await fetchPrevJson(`${key}/events.json`)
  const prevChanges = (await fetchPrevJson(`${key}/changes.json`)) || { changes: [] }
  let changes = prevChanges.changes
  if (prevPacked) {
    const prevEvents = unpackEvents(prevPacked).filter((e) => e.end >= keepFrom)
    // Varovalka: če Wise nenadoma vrne veliko manj dogodkov, je verjetno napaka na njihovi strani.
    if (kept.length < prevEvents.length * 0.5) {
      throw new Error(`sumljivo malo dogodkov (${kept.length} namesto ~${prevEvents.length}), ohranjam prejšnje`)
    }
    const fresh = diffEvents(prevEvents, kept, { at: now, fromLocal: localNow(0) })
    console.log(`  spremembe: ${fresh.length}`)
    changes = [...changes, ...fresh]
  }
  const cutoff = new Date(Date.now() - CHANGES_KEEP_DAYS * 86400e3).toISOString()
  changes = changes.filter((c) => c.at >= cutoff).slice(-3000)

  await writeJson(`${key}/catalog.json`, catalog)
  await writeJson(`${key}/events.json`, { fetchedAt: now, ...packEvents(kept) })
  await writeJson(`${key}/changes.json`, { changes })
  return {
    key, code, name: FACULTIES[key], groups: catalog.groups.length, events: kept.length,
    eventsAt: now, catalogAt: catalog.fetchedAt,
  }
}

/** Ob napaki prekopiramo prejšnje podatke, da aplikacija ne ostane prazna. */
async function keepPrevious(key, prevEntry) {
  if (!prevEntry) return null
  for (const f of ['catalog.json', 'events.json', 'changes.json']) {
    const data = await fetchPrevJson(`${key}/${f}`)
    if (data) await writeJson(`${key}/${f}`, data)
  }
  return prevEntry
}

const prevMeta = await fetchPrevJson('faculties.json')
const keys = ONLY.length ? ONLY : Object.keys(FACULTIES)
const faculties = []
let ok = 0
for (const key of keys) {
  console.log(`${key.toUpperCase()}`)
  try {
    faculties.push(await scrapeFaculty(key, prevMeta))
    ok++
  } catch (e) {
    console.warn(`  ✗ ${e.message}`)
    const prevEntry = prevMeta?.faculties?.find((f) => f.key === key)
    const kept = await keepPrevious(key, prevEntry)
    if (kept) faculties.push({ ...kept, error: e.message })
  }
}
await writeJson('faculties.json', { updatedAt: new Date().toISOString(), faculties })
console.log(`Končano: ${ok}/${keys.length} fakultet osveženih.`)
if (!faculties.length) process.exit(1)
