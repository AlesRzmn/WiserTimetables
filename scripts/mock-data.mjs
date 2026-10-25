// Testni podatki za lokalni razvoj (`npm run mock`), v enakem formatu, kot ga
// zapiše pravi bralnik. Pravi podatki pridejo iz GitHub Actiona.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packEvents } from '../scraper/core.mjs'

const OUT = process.env.OUT_DIR || 'public/data'
const pad = (n) => String(n).padStart(2, '0')
const ds = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const now = new Date()
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
const semStart = new Date(monday); semStart.setDate(semStart.getDate() - 28)
const WEEKS = 16

function faculty({ key, prog, progName, prefix, subgroups, courses, rooms, lecturers }) {
  const parent = { id: `${key}-p`, name: `${prefix}`, parent: null, progs: [prog], years: ['1'] }
  const subs = Array.from({ length: subgroups }, (_, i) => ({
    id: `${key}-${i + 1}`, name: `${prefix} - ${i + 1}.sk.`, parent: parent.id, progs: [prog], years: ['1'],
  }))
  const catalog = {
    programmes: [{ id: prog, name: progName, years: ['1', '2', '3'] }],
    groups: [parent, ...subs],
    fetchedAt: now.toISOString(),
  }
  const events = []
  let n = 0
  for (let w = 0; w < WEEKS; w++) {
    for (const c of courses) {
      for (const slot of c.slots) {
        const day = new Date(semStart); day.setDate(day.getDate() + w * 7 + slot.dow)
        const groups = slot.sub ? slot.sub.map((s) => subs[s - 1].name) : [parent.name]
        events.push({
          uid: `${key}${++n}-${ds(day).replace(/-/g, '')}@mock`,
          start: `${ds(day)}T${slot.from}`, end: `${ds(day)}T${slot.to}`,
          course: c.name, type: slot.type, typeFull: slot.type,
          rooms: [rooms[(n + slot.dow) % rooms.length]], lecturers: [c.lect ?? lecturers[n % lecturers.length]],
          groups, note: '',
        })
      }
    }
  }
  return { catalog, events }
}

const fs = faculty({
  key: 'fs', prog: '22', progName: 'UN 1. stopnja STROJNIŠTVO', prefix: 'STR UN 1. l.', subgroups: 8,
  rooms: ['A-301', 'A-304', 'B-201', 'B-303', 'inž. Ivan Munda', 'C-001'],
  lecturers: ['ANA NOVAK', 'MARKO KRAJNC', 'PETRA HORVAT'],
  courses: [
    { name: 'MATEMATIČNA ANALIZA', lect: 'IRENA KOS', slots: [
      { dow: 0, from: '08:00', to: '09:40', type: 'PR' }, { dow: 1, from: '10:45', to: '12:25', type: 'PR' },
      { dow: 0, from: '11:45', to: '13:25', type: 'AV', sub: [1, 2, 3, 4] }, { dow: 2, from: '08:00', to: '09:40', type: 'AV', sub: [5, 6, 7, 8] },
    ] },
    { name: 'MEHANIKA I', lect: 'BOŠTJAN HARL', slots: [
      { dow: 0, from: '09:55', to: '11:35', type: 'PR' }, { dow: 3, from: '10:45', to: '12:25', type: 'AV', sub: [1, 2, 3, 4, 5, 6, 7, 8] },
    ] },
    { name: 'MATERIALI I', lect: 'FRANC ZUPANIČ', slots: [
      { dow: 1, from: '08:00', to: '09:40', type: 'PR' }, { dow: 3, from: '12:40', to: '14:20', type: 'AV', sub: [1, 2, 3, 4, 5, 6, 7, 8] },
    ] },
    { name: 'TEMELJI KLASIČNE FIZIKE', slots: [
      { dow: 2, from: '10:45', to: '13:20', type: 'PR' }, { dow: 4, from: '08:00', to: '10:30', type: 'LV', sub: [7, 8] },
      { dow: 4, from: '10:45', to: '13:15', type: 'LV', sub: [1, 2] },
    ] },
    { name: 'INŽENIRSKA INFORMATIKA', slots: [
      { dow: 1, from: '14:25', to: '16:05', type: 'PR' }, { dow: 4, from: '13:30', to: '15:10', type: 'RV', sub: [5, 6, 7] },
      { dow: 4, from: '15:15', to: '16:55', type: 'RV', sub: [1, 2, 3, 4] },
    ] },
    { name: 'TUJ JEZIK (ANGLEŠKI JEZIK)', slots: [{ dow: 3, from: '08:00', to: '09:30', type: 'SE (od A do G)', sub: [1, 2, 3, 4, 5, 6, 7, 8] }] },
    { name: 'TUJ JEZIK (NEMŠKI JEZIK)', slots: [{ dow: 0, from: '13:30', to: '15:10', type: 'SE', sub: [1, 2, 3, 4, 5, 6, 7, 8] }] },
  ],
})

const feri = faculty({
  key: 'feri', prog: '18', progName: 'RAČUNALNIŠTVO IN INFORMACIJSKE TEHNOLOGIJE (UN)', prefix: 'RIT 1 UN', subgroups: 4,
  rooms: ['G2-P01', 'G3-Linux', 'Betnava-A', 'G2-1N.13'], lecturers: ['LUKA MLAKAR', 'NINA VIDMAR'],
  courses: [
    { name: 'OSNOVE PROGRAMIRANJA', slots: [{ dow: 0, from: '09:00', to: '11:00', type: 'PR' }, { dow: 2, from: '12:00', to: '14:00', type: 'RV', sub: [1, 2] }] },
    { name: 'DISKRETNE STRUKTURE', slots: [{ dow: 1, from: '12:00', to: '14:00', type: 'PR' }, { dow: 3, from: '08:00', to: '10:00', type: 'AV', sub: [1, 2, 3, 4] }] },
    { name: 'RAČUNALNIŠKA ARHITEKTURA', slots: [{ dow: 2, from: '08:00', to: '10:00', type: 'PR' }, { dow: 4, from: '10:00', to: '12:00', type: 'LV', sub: [1] }] },
    { name: 'MATEMATIKA', slots: [{ dow: 3, from: '14:00', to: '16:00', type: 'PR' }] },
  ],
})

// Nekaj sprememb v tem in naslednjem tednu
const change = (kind, ev, extra = {}) => ({ kind, uid: ev.uid, at: new Date(Date.now() - 3600e3 * (2 + Math.random() * 30)).toISOString(), ev, ...extra })
const thisWeek = (evs, course, type) => evs.find((e) => e.course === course && e.typeFull === type && e.start >= ds(monday))
const fsChanges = []
{
  const del = thisWeek(fs.events, 'MATERIALI I', 'PR')
  fs.events.splice(fs.events.indexOf(del), 1)
  fsChanges.push(change('del', del))
  const mod = thisWeek(fs.events, 'MEHANIKA I', 'PR')
  const old = { ...mod }
  mod.rooms = ['B-201']
  mod.start = mod.start.slice(0, 11) + '12:40'
  mod.end = mod.end.slice(0, 11) + '14:20'
  fsChanges.push(change('mod', mod, { old, fields: ['start', 'end', 'rooms'] }))
  const day = new Date(monday); day.setDate(day.getDate() + 9)
  const add = { ...fs.events[0], uid: 'fs-extra@mock', start: `${ds(day)}T16:10`, end: `${ds(day)}T17:50`, course: 'MATEMATIČNA ANALIZA', type: 'AV', typeFull: 'AV', note: 'nadomestne vaje', groups: ['STR UN 1. l.'] }
  fs.events.push(add)
  fsChanges.push(change('add', add))
}

async function write(key, f, changes) {
  await mkdir(join(OUT, key), { recursive: true })
  await writeFile(join(OUT, key, 'catalog.json'), JSON.stringify(f.catalog))
  await writeFile(join(OUT, key, 'events.json'), JSON.stringify({ fetchedAt: now.toISOString(), ...packEvents(f.events) }))
  await writeFile(join(OUT, key, 'changes.json'), JSON.stringify({ changes }))
}
await write('fs', fs, fsChanges)
await write('feri', feri, [])
await writeFile(join(OUT, 'faculties.json'), JSON.stringify({
  updatedAt: now.toISOString(),
  faculties: [
    { key: 'fs', code: 'umfs', name: 'Fakulteta za strojništvo', groups: 9, events: fs.events.length, eventsAt: now.toISOString(), catalogAt: now.toISOString() },
    { key: 'feri', code: 'feri', name: 'Fakulteta za elektrotehniko, računalništvo in informatiko', groups: 5, events: feri.events.length, eventsAt: now.toISOString(), catalogAt: now.toISOString() },
  ],
}))
console.log(`Testni podatki zapisani v ${OUT} (FS: ${fs.events.length}, FERI: ${feri.events.length} dogodkov)`)
