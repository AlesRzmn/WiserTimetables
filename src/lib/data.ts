import type {
  CalEvent, Catalog, Change, CustomEvent, FacultiesFile, Group, PackedEvents, Profile, WEvent,
} from './types'
import { addDays, minutes, parseDate, toDateStr } from './time'

const BASE = `${import.meta.env.BASE_URL}data`

const cache = new Map<string, Promise<unknown>>()
function getJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}/${path}`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Ni podatkov (${path})`)
      return r.json()
    }).catch((e) => { cache.delete(path); throw e }))
  }
  return cache.get(path) as Promise<T>
}

/** Pozabi naložene podatke, da se ob naslednjem branju prenesejo sveži. */
export function clearDataCache() {
  cache.clear()
  unpacked.clear()
}

export const loadFaculties = () => getJson<FacultiesFile>('faculties.json')
export const loadCatalog = (faculty: string) => getJson<Catalog>(`${faculty}/catalog.json`)
export const loadChanges = (faculty: string) =>
  getJson<{ changes: Change[] }>(`${faculty}/changes.json`).catch(() => ({ changes: [] as Change[] }))

const unpacked = new Map<string, Promise<{ fetchedAt: string; events: WEvent[] }>>()
export function loadEvents(faculty: string) {
  if (!unpacked.has(faculty)) {
    unpacked.set(faculty, getJson<PackedEvents>(`${faculty}/events.json`).then((p) => ({
      fetchedAt: p.fetchedAt,
      events: p.events.map(([uid, start, end, c, typeFull, r, l, g, note]) => ({
        uid, start, end,
        course: p.courses[c],
        type: (typeFull.match(/^[A-ZČŠŽ]+/) || [''])[0],
        typeFull,
        rooms: r.map((i) => p.rooms[i]),
        lecturers: l.map((i) => p.lecturers[i]),
        groups: g.map((i) => p.groups[i]),
        note,
      })),
    })))
  }
  return unpacked.get(faculty)!
}

/**
 * Imena skupin, katerih dogodki spadajo v urnik izbranih skupin:
 * skupina sama, njena nadrejena skupina in (če je izbrana nadrejena) vse podskupine.
 * Enako kot na Wise.
 */
export function groupScope(groupIds: string[], groups: Group[]) {
  const byId = new Map(groups.map((g) => [String(g.id), g]))
  const out = new Set<string>()
  for (const id of groupIds) {
    const g = byId.get(String(id))
    if (!g) continue
    out.add(g.name)
    const parent = g.parent ? byId.get(String(g.parent)) : null
    if (parent) out.add(parent.name)
    for (const c of groups) if (String(c.parent) === String(g.id)) out.add(c.name)
  }
  return out
}

export const inScope = (ev: WEvent, scope: Set<string>) => ev.groups.some((g) => scope.has(g))

/** Ključ za skrivanje: cel predmet ali predmet + tip izvedbe. */
export const courseKey = (course: string, typeFull?: string) => (typeFull ? `${course}\u0000${typeFull}` : course)

export function isHidden(ev: WEvent, hidden: string[]) {
  return hidden.includes(courseKey(ev.course)) || hidden.includes(courseKey(ev.course, ev.typeFull))
}

export function toCal(ev: WEvent, changed?: Change['kind']): CalEvent {
  return {
    key: ev.uid, start: ev.start, end: ev.end, title: ev.course, type: ev.type, typeFull: ev.typeFull,
    rooms: ev.rooms, lecturers: ev.lecturers, groups: ev.groups, note: ev.note, source: 'wise', wise: ev, changed,
  }
}

/** Lastni dogodki, razširjeni na posamezne datume v obdobju [from, to]. */
export function expandCustom(list: CustomEvent[], from: string, to: string): CalEvent[] {
  const out: CalEvent[] = []
  for (const c of list) {
    const until = c.repeatUntil && c.repeatUntil > c.date ? c.repeatUntil : c.date
    let d = c.date
    // Skok na prvi termin v obdobju
    if (d < from && c.repeatUntil) {
      const weeks = Math.floor((parseDate(from).getTime() - parseDate(d).getTime()) / (7 * 86400e3))
      d = addDays(d, weeks * 7)
    }
    for (; d <= until && d <= to; d = addDays(d, 7)) {
      if (d < from) continue
      out.push({
        key: `${c.id}@${d}`, start: `${d}T${c.start}`, end: `${d}T${c.end}`, title: c.title,
        type: '', typeFull: '', rooms: [], lecturers: [], groups: [], note: c.note || '',
        source: 'custom', custom: c, color: c.color,
      })
      if (!c.repeatUntil) break
    }
  }
  return out
}

/** Vse, kar potrebujemo za urnik ene osebe. */
export type ProfileData = {
  profile: Profile
  catalog: Catalog
  scope: Set<string>
  events: WEvent[] // dogodki osebe (že filtrirani po skupinah, ne pa po skritih predmetih)
  changes: Change[] // spremembe, ki zadevajo osebo
  fetchedAt: string
}

export async function loadProfileData(profile: Profile): Promise<ProfileData> {
  const [catalog, ev, ch] = await Promise.all([
    loadCatalog(profile.faculty), loadEvents(profile.faculty), loadChanges(profile.faculty),
  ])
  const scope = groupScope(profile.groupIds, catalog.groups)
  return {
    profile,
    catalog,
    scope,
    events: ev.events.filter((e) => inScope(e, scope)),
    changes: ch.changes.filter((c) => inScope(c.ev, scope) || (c.old && inScope(c.old, scope))),
    fetchedAt: ev.fetchedAt,
  }
}

// ---------------------------------------------------------------------------
// Prekrivanje urnikov
// ---------------------------------------------------------------------------

export type Interval = [number, number] // minute od polnoči

export function mergeIntervals(list: Interval[]): Interval[] {
  const s = [...list].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

export function busyOnDay(events: CalEvent[], date: string): Interval[] {
  return mergeIntervals(
    events.filter((e) => e.start.slice(0, 10) === date).map((e) => [minutes(e.start), minutes(e.end)] as Interval),
  )
}

export type Segment = { from: number; to: number; kind: 'both' | 'a' | 'b' | 'free' }

/** Razdeli dan na odseke: oba zasedena, samo A, samo B, oba prosta. */
export function compareDay(a: Interval[], b: Interval[], dayFrom: number, dayTo: number): Segment[] {
  const cuts = new Set<number>([dayFrom, dayTo])
  for (const [s, e] of [...a, ...b]) {
    if (s > dayFrom && s < dayTo) cuts.add(s)
    if (e > dayFrom && e < dayTo) cuts.add(e)
  }
  const pts = [...cuts].sort((x, y) => x - y)
  const inA = (m: number) => a.some(([s, e]) => m >= s && m < e)
  const inB = (m: number) => b.some(([s, e]) => m >= s && m < e)
  const segs: Segment[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const mid = (pts[i] + pts[i + 1]) / 2
    const kind = inA(mid) ? (inB(mid) ? 'both' : 'a') : inB(mid) ? 'b' : 'free'
    const last = segs[segs.length - 1]
    if (last && last.kind === kind) last.to = pts[i + 1]
    else segs.push({ from: pts[i], to: pts[i + 1], kind })
  }
  return segs
}

export function datesOfWeek(start: string, n = 7) {
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}

export const isWeekend = (d: string) => [0, 6].includes(parseDate(d).getDay())
export { toDateStr }
