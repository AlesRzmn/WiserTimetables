// Testi jedra bralnika: `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import {
  fetchCatalog, fetchEvents, parseIcs, splitSummary, splitGroups, knownGroupNames, groupScope,
  diffEvents, packEvents, unpackEvents, icsTimeToLocal,
} from './core.mjs'

// Posnetek strukture javne Wise strani (poenostavljen)
const page = (prog, yr) => `<!doctype html><html><body>
<form class="cascade cascade-row"><select name="prog"><option value="">Program…</option>
<option value="22">UN 1. stopnja STROJNIŠTVO</option><option value="40">MAG FILOZOFIJA</option></select>
<select name="yr"><option value="">Letnik…</option>${prog === '22' ? '<option value="1">1</option>' : ''}</select></form>
<form class="picker-form"><input type="hidden" name="pickon" value="c"><label class="picker-item"><input type="checkbox" name="pick[]" value="9"><span>PREDMET</span></label></form>
<form class="picker-form"><input type="hidden" name="pickon" value="g">
${prog === '22' ? `
<label class="picker-item " data-search="STR UN 1. l. 50"><input type="checkbox" name="pick[]" value="50"> <span>STR UN 1. l.</span></label>
<label class="picker-item is-child" data-search="x"><input type="checkbox" name="pick[]" value="840"> <span>STR UN 1. l. - 1.sk.</span></label>
<label class="picker-item is-child" data-search="x"><input type="checkbox" name="pick[]" value="846"> <span>STR UN 1. l. - 7.sk.</span></label>` : ''}
${prog === '40' ? `<label class="picker-item"><input type="checkbox" name="pick[]" value="7"> <span>Filozofija, DP, 2L</span></label>` : ''}
${yr ? '' : ''}
</form></body></html>`

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:1-20261019@umfs.wise-tt.com', 'DTSTART;TZID=Europe/Ljubljana:20261019T080000',
  'DTEND;TZID=Europe/Ljubljana:20261019T094000', 'SUMMARY:MATEMATIČNA ANALIZA (PR)', 'LOCATION:B-201',
  'DESCRIPTION:Izvajalci: IRENA KOS\\nSkupine: STR UN 1. l.', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:2-20261019@umfs.wise-tt.com', 'DTSTART;TZID=Europe/Ljubljana:20261019T114500',
  'DTEND;TZID=Europe/Ljubljana:20261019T132500', 'SUMMARY:TUJ JEZIK (ANGLEŠKI JEZIK) (SE (od A do G))',
  'LOCATION:A-301\\, A-302', 'DESCRIPTION:Izvajalci: NATAŠA POTOČNIK\\, ANA NOVAK\\nSkupine: STR UN 1. l. - 7.s',
  ' k.\\, STR UN 1. l. - 1.sk.\\nod 8. ure do 10.30', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:3-20261020@umfs.wise-tt.com', 'DTSTART:20261020T080000Z', 'DTEND:20261020T093000Z',
  'SUMMARY:ETIKA (SE)', 'LOCATION:FF-1', 'DESCRIPTION:Izvajalci: X\\nSkupine: Filozofija\\, DP\\, 2L', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const ctx = {
  parseHTML: (h) => parseHTML(h).document,
  fetchText: async (url) => {
    if (url.includes('/reports?')) return ICS
    const u = new URL(url)
    return page(u.searchParams.get('prog'), u.searchParams.get('yr'))
  },
}

test('katalog: programi, letniki, hierarhija skupin', async () => {
  const cat = await fetchCatalog('umfs', ctx)
  assert.deepEqual(cat.programmes.map((p) => p.id), ['22', '40'])
  assert.deepEqual(cat.programmes[0].years, ['1'])
  const g846 = cat.groups.find((g) => g.id === '846')
  assert.equal(g846.name, 'STR UN 1. l. - 7.sk.')
  assert.equal(g846.parent, '50')
  assert.equal(cat.groups.find((g) => g.id === '50').parent, null)
  assert.deepEqual(g846.years, ['1'])
})

test('iCal: razčlenitev, zlepljene vrstice, vejice, UTC', async () => {
  const cat = await fetchCatalog('umfs', ctx)
  const evs = await fetchEvents('umfs', cat, ctx)
  assert.equal(evs.length, 3)
  const [a, b, c] = evs
  assert.equal(a.start, '2026-10-19T08:00')
  assert.equal(a.course, 'MATEMATIČNA ANALIZA')
  assert.equal(a.type, 'PR')
  assert.deepEqual(b.rooms, ['A-301', 'A-302'])
  assert.deepEqual(b.lecturers, ['NATAŠA POTOČNIK', 'ANA NOVAK'])
  assert.deepEqual(b.groups, ['STR UN 1. l. - 7.sk.', 'STR UN 1. l. - 1.sk.'])
  assert.equal(b.course, 'TUJ JEZIK (ANGLEŠKI JEZIK)')
  assert.equal(b.typeFull, 'SE (od A do G)')
  assert.equal(b.type, 'SE')
  assert.equal(b.note, 'od 8. ure do 10.30')
  assert.deepEqual(c.groups, ['Filozofija, DP, 2L'], 'ime z vejicami ostane celo')
  assert.equal(c.start, '2026-10-20T10:00', 'UTC → ljubljanski čas (poletni čas, +2)')
})

test('obseg skupine: podskupina dobi nadrejeno, nadrejena dobi vse podskupine', async () => {
  const cat = await fetchCatalog('umfs', ctx)
  assert.deepEqual([...groupScope('846', cat.groups)].sort(), ['STR UN 1. l.', 'STR UN 1. l. - 7.sk.'])
  assert.equal(groupScope('50', cat.groups).size, 3)
})

test('splitSummary in splitGroups robni primeri', () => {
  assert.deepEqual(splitSummary('PREDMET BREZ TIPA'), { course: 'PREDMET BREZ TIPA', type: '', typeFull: '' })
  assert.equal(splitSummary('X (LV 2)').type, 'LV')
  const known = knownGroupNames([{ name: 'A, B' }, { name: 'C' }])
  assert.deepEqual(splitGroups('A, B, C, D', known), ['A, B', 'C', 'D'])
  assert.equal(icsTimeToLocal('20260115T080000Z'), '2026-01-15T09:00', 'zimski čas +1')
})

test('pakiranje je brez izgub', () => {
  const evs = parseIcs(ICS, knownGroupNames([{ name: 'Filozofija, DP, 2L' }]))
  assert.deepEqual(unpackEvents(packEvents(evs)), evs)
})

test('spremembe: odpadlo, novo, prestavljeno; preteklost se ignorira', () => {
  const base = { course: 'M', type: 'PR', typeFull: 'PR', rooms: ['A'], lecturers: [], groups: ['g'], note: '' }
  const old = [
    { ...base, uid: 'past', start: '2026-10-01T08:00', end: '2026-10-01T09:00' },
    { ...base, uid: 'gone', start: '2026-11-01T08:00', end: '2026-11-01T09:00' },
    { ...base, uid: 'moved', start: '2026-11-02T08:00', end: '2026-11-02T09:00' },
  ]
  const neu = [
    { ...base, uid: 'moved', start: '2026-11-02T10:00', end: '2026-11-02T11:00', rooms: ['B'] },
    { ...base, uid: 'new', start: '2026-11-03T08:00', end: '2026-11-03T09:00' },
  ]
  const ch = diffEvents(old, neu, { at: 'T', fromLocal: '2026-10-24T00:00' })
  const byUid = Object.fromEntries(ch.map((c) => [c.uid, c]))
  assert.equal(ch.length, 3)
  assert.equal(byUid.gone.kind, 'del')
  assert.equal(byUid.new.kind, 'add')
  assert.deepEqual(byUid.moved.fields, ['start', 'end', 'rooms'])
  assert.ok(!byUid.past)
})
