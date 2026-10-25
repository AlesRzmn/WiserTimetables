import type { Change, WEvent } from './types'
import { dayLabel, timeOf } from './time'

const when = (e: WEvent) => `${dayLabel(e.start)} ${timeOf(e.start)}–${timeOf(e.end)}`

export function changeTitle(c: Change) {
  const t = `${c.ev.course}${c.ev.typeFull ? ` (${c.ev.typeFull})` : ''}`
  if (c.kind === 'add') return { label: 'Novo', tone: 'add', text: t }
  if (c.kind === 'del') return { label: 'Odpade', tone: 'del', text: t }
  return { label: 'Spremenjeno', tone: 'mod', text: t }
}

/** Kratek opis, kaj se je spremenilo. */
export function changeDetails(c: Change): string[] {
  if (c.kind !== 'mod' || !c.old) return [when(c.ev) + (c.ev.rooms.length ? ` · ${c.ev.rooms.join(', ')}` : '')]
  const o = c.old
  const n = c.ev
  const out: string[] = []
  const f = new Set(c.fields || [])
  if (f.has('start') || f.has('end')) out.push(`${when(o)} → ${when(n)}`)
  else out.push(when(n))
  if (f.has('rooms')) out.push(`prostor: ${o.rooms.join(', ') || '—'} → ${n.rooms.join(', ') || '—'}`)
  if (f.has('lecturers')) out.push(`izvajalci: ${n.lecturers.join(', ') || '—'}`)
  if (f.has('groups')) out.push('spremenjene skupine')
  if (f.has('note') && n.note) out.push(`opomba: ${n.note}`)
  if (f.has('course') || f.has('typeFull')) out.push(`prej: ${o.course} (${o.typeFull})`)
  return out
}
