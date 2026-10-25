import { useState } from 'react'
import type { CustomEvent } from '../lib/types'
import { PROFILE_COLORS } from '../lib/colors'
import { Modal } from './Modal'

type Props = {
  initial: CustomEvent
  isNew: boolean
  onSave: (c: CustomEvent) => void
  onDelete?: () => void
  onClose: () => void
}

export function CustomEventEditor({ initial, isNew, onSave, onDelete, onClose }: Props) {
  const [c, setC] = useState(initial)
  const [repeat, setRepeat] = useState(!!initial.repeatUntil)
  const set = (patch: Partial<CustomEvent>) => setC((x) => ({ ...x, ...patch }))
  const valid = c.title.trim() && c.date && c.start && c.end && c.end > c.start && (!repeat || (c.repeatUntil && c.repeatUntil >= c.date))

  return (
    <Modal
      title={isNew ? 'Nov dogodek' : 'Uredi dogodek'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn btn-danger" onClick={onDelete}>Izbriši</button>}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Prekliči</button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onSave({ ...c, title: c.title.trim(), repeatUntil: repeat ? c.repeatUntil : undefined })}
          >
            Shrani
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field span-2">
          <span>Naslov</span>
          <input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder="npr. trening, kolokvij, učenje" autoFocus />
        </label>
        <label className="field">
          <span>Datum</span>
          <input type="date" value={c.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <div className="field">
          <span>Čas</span>
          <div className="row">
            <input type="time" value={c.start} onChange={(e) => set({ start: e.target.value })} />
            <span>–</span>
            <input type="time" value={c.end} onChange={(e) => set({ end: e.target.value })} />
          </div>
        </div>
        <label className="field check">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          <span>Ponavljaj vsak teden</span>
        </label>
        {repeat && (
          <label className="field">
            <span>Do datuma</span>
            <input type="date" value={c.repeatUntil || ''} min={c.date} onChange={(e) => set({ repeatUntil: e.target.value })} />
          </label>
        )}
        <div className="field span-2">
          <span>Barva</span>
          <div className="swatches">
            {PROFILE_COLORS.map((col) => (
              <button key={col} className={`swatch ${c.color === col ? 'is-on' : ''}`} style={{ background: col }} onClick={() => set({ color: col })} aria-label={`Barva ${col}`} />
            ))}
          </div>
        </div>
        <label className="field span-2">
          <span>Opomba</span>
          <textarea rows={2} value={c.note || ''} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>
    </Modal>
  )
}
