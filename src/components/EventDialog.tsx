import { useState } from 'react'
import type { CalEvent } from '../lib/types'
import { dayLabel, timeOf } from '../lib/time'
import { TYPE_NAMES } from '../lib/colors'
import { Modal } from './Modal'

export type Notes = { byUid: Record<string, string>; byCourse: Record<string, string> }

type Props = {
  ev: CalEvent
  owner: string
  isMine: boolean
  notes: Notes
  onNotes: (n: Notes) => void
  onHideCourse?: (course: string, typeFull?: string) => void
  onEditCustom?: () => void
  onClose: () => void
}

export function EventDialog({ ev, owner, isMine, notes, onNotes, onHideCourse, onEditCustom, onClose }: Props) {
  const [occ, setOcc] = useState(notes.byUid[ev.key] || '')
  const [course, setCourse] = useState(notes.byCourse[ev.title] || '')

  const saveNotes = () => {
    const byUid = { ...notes.byUid }
    const byCourse = { ...notes.byCourse }
    if (occ.trim()) byUid[ev.key] = occ.trim(); else delete byUid[ev.key]
    if (ev.source === 'wise') {
      if (course.trim()) byCourse[ev.title] = course.trim(); else delete byCourse[ev.title]
    }
    onNotes({ byUid, byCourse })
  }
  const close = () => { if (isMine) saveNotes(); onClose() }

  const typeName = TYPE_NAMES[ev.type]

  return (
    <Modal
      title={ev.title}
      onClose={close}
      footer={
        <>
          {ev.source === 'wise' && onHideCourse && (
            <details className="menu">
              <summary className="btn">Skrij …</summary>
              <div className="menu-list">
                <button onClick={() => { onHideCourse(ev.title, ev.typeFull); onClose() }}>
                  samo {ev.typeFull || 'ta tip'} pri tem predmetu
                </button>
                <button onClick={() => { onHideCourse(ev.title); onClose() }}>cel predmet</button>
              </div>
            </details>
          )}
          {ev.source === 'custom' && onEditCustom && (
            <button className="btn" onClick={onEditCustom}>Uredi dogodek</button>
          )}
          <span className="spacer" />
          <button className="btn btn-primary" onClick={close}>Zapri</button>
        </>
      }
    >
      {ev.changed && (
        <p className={`banner banner-${ev.changed}`}>
          {ev.changed === 'del' && 'Ta termin je bil odstranjen iz urnika.'}
          {ev.changed === 'mod' && 'Ta termin je bil nedavno spremenjen.'}
          {ev.changed === 'add' && 'Ta termin je bil nedavno dodan.'}
        </p>
      )}
      <dl className="details">
        <dt>Kdaj</dt>
        <dd>{dayLabel(ev.start, true)}, {timeOf(ev.start)}–{timeOf(ev.end)}</dd>
        {ev.typeFull && (<><dt>Izvedba</dt><dd>{ev.typeFull}{typeName && ` · ${typeName}`}</dd></>)}
        {ev.rooms.length > 0 && (<><dt>Prostor</dt><dd>{ev.rooms.join(', ')}</dd></>)}
        {ev.lecturers.length > 0 && (<><dt>Izvajalci</dt><dd>{ev.lecturers.join(', ')}</dd></>)}
        {ev.groups.length > 0 && (<><dt>Skupine</dt><dd className="small">{ev.groups.join(', ')}</dd></>)}
        {ev.note && (<><dt>Opomba</dt><dd className="pre">{ev.note}</dd></>)}
        {!isMine && (<><dt>Urnik</dt><dd>{owner}</dd></>)}
      </dl>

      {isMine && (
        <div className="notes">
          <label className="field">
            <span>Moja opomba za ta termin</span>
            <textarea rows={2} value={occ} onChange={(e) => setOcc(e.target.value)} placeholder="npr. prinesi kalkulator, kolokvij …" />
          </label>
          {ev.source === 'wise' && (
            <label className="field">
              <span>Opomba za predmet (velja za vse termine)</span>
              <textarea rows={2} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="npr. prisotnost obvezna, gradivo na Moodlu" />
            </label>
          )}
        </div>
      )}
    </Modal>
  )
}
