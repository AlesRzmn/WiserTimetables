// Jedro bralnika Wise Timetable.
// Ne uporablja nič specifičnega za Node: dobi funkcijo za prenos besedila
// (fetchText) in funkcijo, ki HTML pretvori v DOM (parseHTML). Tako ga lahko
// zaženemo v GitHub Actionu (Node + linkedom) ali v brskalniku (DOMParser).

export const BASE = 'https://www.wise-tt.com'

// Kratice fakultet UM. Koda na Wise strežniku se poišče samodejno.
export const FACULTIES = {
  fs: 'Fakulteta za strojništvo',
  feri: 'Fakulteta za elektrotehniko, računalništvo in informatiko',
  epf: 'Ekonomsko-poslovna fakulteta',
  fgpa: 'Fakulteta za gradbeništvo, prometno inženirstvo in arhitekturo',
  fkkt: 'Fakulteta za kemijo in kemijsko tehnologijo',
  fkbv: 'Fakulteta za kmetijstvo in biosistemske vede',
  fl: 'Fakulteta za logistiko',
  fnm: 'Fakulteta za naravoslovje in matematiko',
  fov: 'Fakulteta za organizacijske vede',
  ft: 'Fakulteta za turizem',
  fvv: 'Fakulteta za varnostne vede',
  fzv: 'Fakulteta za zdravstvene vede',
  ff: 'Filozofska fakulteta',
  mf: 'Medicinska fakulteta',
  pef: 'Pedagoška fakulteta',
  pf: 'Pravna fakulteta',
  fe: 'Fakulteta za energetiko',
  ag: 'Akademija za glasbo',
}

const GROUP_BATCH = 250 // Wise zavrne predolge naslove, zato skupine pošiljamo v paketih

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

// ---------------------------------------------------------------------------
// Iskanje kode fakultete
// ---------------------------------------------------------------------------

/** Vrne kodo, ki jo Wise uporablja v /web/<koda>/, ali null. */
export async function resolveSchoolCode(kratica, { fetchText, parseHTML, fetchFinalUrl }) {
  // Stari naslov wtt_um_<kratica> preusmeri na novega.
  if (fetchFinalUrl) {
    try {
      const url = await fetchFinalUrl(`${BASE}/wtt_um_${kratica}/`)
      const m = url && url.match(/\/web\/([^/?#]+)/)
      if (m) return m[1]
    } catch { /* poskusi naprej */ }
  }
  for (const code of [`um${kratica}`, kratica]) {
    try {
      const doc = parseHTML(await fetchText(`${BASE}/web/${code}/`))
      if (doc.querySelector('select[name=prog]')) return code
    } catch { /* naslednji */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// Katalog: programi, letniki, skupine
// ---------------------------------------------------------------------------

function selectOptions(doc, name) {
  return [...doc.querySelectorAll(`select[name=${name}] option`)]
    .map((o) => ({ id: o.getAttribute('value') || '', name: clean(o.textContent) }))
    .filter((o) => o.id)
}

/**
 * Skupine iz izbirnika. Podskupine imajo razred "is-child" in sledijo
 * svoji nadrejeni skupini, zato si zapomnimo zadnjo nadrejeno.
 */
function groupPicker(doc) {
  const form = [...doc.querySelectorAll('form.picker-form')].find(
    (f) => f.querySelector('input[name=pickon]')?.getAttribute('value') === 'g',
  )
  if (!form) return []
  let parent = null
  const out = []
  for (const cb of form.querySelectorAll('input[name="pick[]"]')) {
    const label = cb.closest('label')
    const id = cb.getAttribute('value')
    const name = clean(label ? (label.querySelector('span') || label).textContent : '')
    if (!id || !name) continue
    const isChild = !!label && /(^|\s)is-child(\s|$)/.test(label.getAttribute('class') || '')
    if (!isChild) parent = id
    out.push({ id, name, parent: isChild ? parent : null })
  }
  return out
}

/**
 * Prebere programe, letnike in skupine fakultete.
 * Rezultat: { programmes: [{id, name, years: [..]}], groups: [{id, name, progs: [..], years: [..]}] }
 */
export async function fetchCatalog(code, { fetchText, parseHTML, delay = () => Promise.resolve() }) {
  const page = async (qs) => {
    await delay()
    return parseHTML(await fetchText(`${BASE}/web/${code}/${qs ? '?' + qs : ''}`))
  }
  const root = await page('')
  const programmes = selectOptions(root, 'prog')
  const groups = new Map()
  const addGroup = (g, prog, yr) => {
    const cur = groups.get(g.id) || { id: g.id, name: g.name, parent: g.parent, progs: [], years: [] }
    if (!cur.parent && g.parent) cur.parent = g.parent
    if (!cur.progs.includes(prog)) cur.progs.push(prog)
    if (yr && !cur.years.includes(yr)) cur.years.push(yr)
    groups.set(g.id, cur)
  }

  for (const prog of programmes) {
    const doc = await page(`prog=${encodeURIComponent(prog.id)}`)
    const years = selectOptions(doc, 'yr').map((y) => y.id)
    prog.years = years
    groupPicker(doc).forEach((g) => addGroup(g, prog.id, null))
    // Fakultete z izbiro letnika: skupine označimo z letnikom.
    for (const yr of years) {
      const ydoc = await page(`prog=${encodeURIComponent(prog.id)}&yr=${encodeURIComponent(yr)}`)
      groupPicker(ydoc).forEach((g) => addGroup(g, prog.id, yr))
    }
  }
  return { programmes, groups: [...groups.values()] }
}

// ---------------------------------------------------------------------------
// iCal
// ---------------------------------------------------------------------------

function unescapeIcs(s) {
  return (s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

const splitList = (s) => (s || '').split(/\s*,\s*/).map(clean).filter(Boolean)

const nameKey = (s) => clean(s).replace(/\s*,\s*/g, ',').toLowerCase()

/**
 * Seznam skupin iz opisa dogodka. Imena skupin lahko vsebujejo vejice
 * ("Filozofija, DP, 2L"), zato kose po vejicah zlepimo nazaj, kadar se
 * ujemajo z znanim imenom skupine (najdaljše ujemanje zmaga).
 */
export function splitGroups(s, known) {
  const parts = splitList(s)
  if (!known || !known.size) return parts
  const maxParts = known.maxParts || 1
  const out = []
  for (let i = 0; i < parts.length;) {
    let taken = 1
    for (let j = Math.min(parts.length, i + maxParts); j > i + 1; j--) {
      if (known.has(nameKey(parts.slice(i, j).join(', ')))) { taken = j - i; break }
    }
    const piece = parts.slice(i, i + taken).join(', ')
    out.push(known.get(nameKey(piece)) || piece)
    i += taken
  }
  return out
}

/** Map nameKey → izvirno ime, za splitGroups. */
export function knownGroupNames(groups) {
  const map = new Map(groups.map((g) => [nameKey(g.name), g.name]))
  // največ koliko kosov (ločenih z vejico) ima posamezno ime
  map.maxParts = Math.max(1, ...groups.map((g) => g.name.split(',').length))
  return map
}

/** "20261002T085500" (+ TZID ali Z) → "2026-10-02T08:55" po ljubljanskem času. */
export function icsTimeToLocal(value, params = '') {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', , z] = m
  if (!z) return `${y}-${mo}-${d}T${h}:${mi}`
  // UTC → Europe/Ljubljana
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  void params
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** "MEHANIKA I (AV)" → { course: "MEHANIKA I", type: "AV", typeFull: "AV" } */
export function splitSummary(summary) {
  const s = clean(summary)
  if (!s.endsWith(')')) return { course: s, type: '', typeFull: '' }
  let depth = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++
    else if (s[i] === '(') {
      depth--
      if (depth === 0) {
        const typeFull = s.slice(i + 1, -1).trim()
        const course = s.slice(0, i).trim()
        if (!course) break
        const type = (typeFull.match(/^[A-ZČŠŽ]+/) || [''])[0]
        return { course, type, typeFull }
      }
    }
  }
  return { course: s, type: '', typeFull: '' }
}

/** Razčleni iCal v seznam dogodkov. `known` = knownGroupNames(katalog). */
export function parseIcs(text, known) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const out = []
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0]
    const props = {}
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(':')
      if (i <= 0) continue
      const [key, ...params] = line.slice(0, i).split(';')
      props[key.toUpperCase()] = { value: line.slice(i + 1), params: params.join(';') }
    }
    if (!props.UID || !props.DTSTART) continue
    const desc = unescapeIcs(props.DESCRIPTION?.value)
    const fields = {}
    const extra = []
    for (const l of desc.split('\n')) {
      const m = l.match(/^\s*([^:]{2,30}):\s*(.*)$/)
      if (m) fields[m[1].trim().toLowerCase()] = m[2]
      else if (clean(l)) extra.push(clean(l))
    }
    const { course, type, typeFull } = splitSummary(unescapeIcs(props.SUMMARY?.value))
    const knownFields = ['izvajalci', 'skupine']
    const note = [
      ...Object.entries(fields).filter(([k]) => !knownFields.includes(k)).map(([k, v]) => `${k}: ${v}`),
      ...extra,
    ].join('\n')
    out.push({
      uid: props.UID.value.trim(),
      start: icsTimeToLocal(props.DTSTART.value.trim(), props.DTSTART.params),
      end: icsTimeToLocal((props.DTEND || props.DTSTART).value.trim(), (props.DTEND || props.DTSTART).params),
      course,
      type,
      typeFull,
      rooms: splitList(unescapeIcs(props.LOCATION?.value)),
      lecturers: splitList(fields['izvajalci']),
      groups: splitGroups(fields['skupine'], known),
      note,
    })
  }
  return out
}

/** Vsi dogodki za podane skupine (v paketih), brez podvojitev. */
export async function fetchEvents(code, catalog, { fetchText, delay = () => Promise.resolve() }) {
  const groupIds = catalog.groups.map((g) => g.id)
  const known = knownGroupNames(catalog.groups)
  const byUid = new Map()
  for (let i = 0; i < groupIds.length; i += GROUP_BATCH) {
    const ids = groupIds.slice(i, i + GROUP_BATCH).join('_')
    await delay()
    const text = await fetchText(`${BASE}/web/${code}/reports?g=${ids}&lang=sl&format=ics`)
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error(`Wise ni vrnil iCal za ${code}`)
    for (const ev of parseIcs(text, known)) byUid.set(ev.uid, ev)
  }
  return [...byUid.values()].sort((a, b) => a.start.localeCompare(b.start))
}

// ---------------------------------------------------------------------------
// Kompaktni zapis za spletno aplikacijo
// ---------------------------------------------------------------------------

/**
 * Dogodki se zapišejo kot tabele, nizi pa se shranijo enkrat v slovarje.
 * e = [uid, start, end, courseIdx, typeFull, rooms[], lecturers[], groups[], note]
 */
export function packEvents(events) {
  const tables = { courses: [], rooms: [], lecturers: [], groups: [] }
  const idx = {}
  const put = (table, value) => {
    const key = table + '\u0000' + value
    if (!(key in idx)) { idx[key] = tables[table].length; tables[table].push(value) }
    return idx[key]
  }
  const rows = events.map((e) => [
    e.uid, e.start, e.end, put('courses', e.course), e.typeFull,
    e.rooms.map((r) => put('rooms', r)),
    e.lecturers.map((l) => put('lecturers', l)),
    e.groups.map((g) => put('groups', g)),
    e.note || '',
  ])
  return { ...tables, events: rows }
}

export function unpackEvents(packed) {
  return packed.events.map(([uid, start, end, c, typeFull, r, l, g, note]) => {
    const { type } = splitSummary(`x (${typeFull})`)
    return {
      uid, start, end, course: packed.courses[c], type: typeFull ? type : '', typeFull,
      rooms: r.map((i) => packed.rooms[i]),
      lecturers: l.map((i) => packed.lecturers[i]),
      groups: g.map((i) => packed.groups[i]),
      note,
    }
  })
}

// ---------------------------------------------------------------------------
// Spremembe med dvema branjema
// ---------------------------------------------------------------------------

const COMPARED = ['start', 'end', 'course', 'typeFull', 'rooms', 'lecturers', 'groups', 'note']
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Primerja staro in novo stanje. Upošteva le dogodke od `fromLocal` naprej,
 * da spremembe v preteklosti ne delajo šuma.
 * Vrne [{kind: 'add'|'del'|'mod', uid, at, ev, old?, fields?}]
 */
export function diffEvents(oldEvents, newEvents, { at, fromLocal }) {
  const oldMap = new Map(oldEvents.map((e) => [e.uid, e]))
  const newMap = new Map(newEvents.map((e) => [e.uid, e]))
  const relevant = (e) => e && e.end >= fromLocal
  const changes = []
  for (const [uid, ev] of newMap) {
    const old = oldMap.get(uid)
    if (!old) {
      if (relevant(ev)) changes.push({ kind: 'add', uid, at, ev })
      continue
    }
    const fields = COMPARED.filter((f) => !same(old[f], ev[f]))
    if (fields.length && (relevant(ev) || relevant(old))) changes.push({ kind: 'mod', uid, at, ev, old, fields })
  }
  for (const [uid, old] of oldMap) {
    if (!newMap.has(uid) && relevant(old)) changes.push({ kind: 'del', uid, at, ev: old })
  }
  return changes
}

/**
 * Imena skupin, katerih dogodki spadajo v urnik izbrane skupine:
 * skupina sama, njena nadrejena skupina (npr. "STR UN 1. l." za "… - 7.sk.")
 * in, če je izbrana nadrejena skupina, vse njene podskupine. Tako dela Wise.
 */
export function groupScope(groupId, groups) {
  const byId = new Map(groups.map((g) => [String(g.id), g]))
  const g = byId.get(String(groupId))
  if (!g) return new Set()
  const out = new Set([g.name])
  if (g.parent && byId.get(String(g.parent))) out.add(byId.get(String(g.parent)).name)
  for (const c of groups) if (String(c.parent) === String(g.id)) out.add(c.name)
  return out
}
