import { useEffect, useMemo, useState } from 'react'
import type { Catalog, Faculty, Profile } from '../lib/types'
import { loadCatalog } from '../lib/data'
import { PROFILE_COLORS } from '../lib/colors'
import { Modal } from './Modal'

type Props = {
  initial: Profile
  faculties: Faculty[]
  isNew: boolean
  onSave: (p: Profile) => void
  onDelete?: () => void
  onClose?: () => void
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function ProfileEditor({ initial, faculties, isNew, onSave, onDelete, onClose }: Props) {
  const [p, setP] = useState<Profile>(initial)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!p.faculty) return
    let alive = true
    setCatalog(null)
    setError('')
    loadCatalog(p.faculty)
      .then((c) => alive && setCatalog(c))
      .catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [p.faculty])

  const programme = catalog?.programmes.find((x) => x.id === p.programme)
  const years = programme?.years ?? []

  const groups = useMemo(() => {
    if (!catalog || !p.programme) return []
    const fq = fold(q.trim())
    return catalog.groups.filter((g) =>
      g.progs.includes(p.programme)
      && (!p.year || !g.years.length || g.years.includes(p.year))
      && (!fq || fold(g.name).includes(fq)),
    )
  }, [catalog, p.programme, p.year, q])

  const byId = useMemo(() => new Map(catalog?.groups.map((g) => [g.id, g]) ?? []), [catalog])

  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }))
  const toggle = (id: string) =>
    set({ groupIds: p.groupIds.includes(id) ? p.groupIds.filter((x) => x !== id) : [...p.groupIds, id] })

  const valid = p.name.trim() && p.faculty && p.groupIds.length > 0

  return (
    <Modal
      title={isNew ? (p.isMe ? 'Tvoj urnik' : 'Nov prijatelj') : `Uredi: ${initial.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          {onDelete && <button className="btn btn-danger" onClick={onDelete}>Odstrani</button>}
          <span className="spacer" />
          {onClose && <button className="btn" onClick={onClose}>Prekliči</button>}
          <button className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...p, name: p.name.trim() })}>
            Shrani
          </button>
        </>
      }
    >
      {isNew && p.isMe && (
        <p className="muted">
          Izberi fakulteto, program in svojo skupino. Vse se shrani samo v tem brskalniku.
        </p>
      )}
      <div className="form-grid">
        <label className="field">
          <span>Ime</span>
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ime" autoFocus />
        </label>
        <div className="field">
          <span>Barva</span>
          <div className="swatches">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${p.color === c ? 'is-on' : ''}`}
                style={{ background: c }}
                onClick={() => set({ color: c })}
                aria-label={`Barva ${c}`}
              />
            ))}
          </div>
        </div>
        <label className="field">
          <span>Fakulteta</span>
          <select
            value={p.faculty}
            onChange={(e) => set({ faculty: e.target.value, programme: '', year: '', groupIds: [] })}
          >
            <option value="">Izberi …</option>
            {faculties.map((f) => (
              <option key={f.key} value={f.key}>{f.key.toUpperCase()} – {f.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Program</span>
          <select
            value={p.programme}
            disabled={!catalog}
            onChange={(e) => set({ programme: e.target.value, year: '' })}
          >
            <option value="">{catalog ? 'Izberi …' : p.faculty ? 'Nalagam …' : '—'}</option>
            {catalog?.programmes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        {years.length > 0 && (
          <label className="field">
            <span>Letnik</span>
            <select value={p.year} onChange={(e) => set({ year: e.target.value })}>
              <option value="">Vsi</option>
              {years.map((y) => <option key={y} value={y}>{y}. letnik</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {p.programme && (
        <div className="group-picker">
          <div className="group-picker-head">
            <strong>Skupine</strong>
            <span className="muted small">
              Izberi podskupino (npr. »… - 7.sk.«). Predavanja celega letnika se dodajo samodejno.
            </span>
            <input className="search" placeholder="Išči skupino …" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.id} className={g.parent ? 'is-child' : ''}>
                <label>
                  <input type="checkbox" checked={p.groupIds.includes(g.id)} onChange={() => toggle(g.id)} />
                  {g.name}
                </label>
              </li>
            ))}
            {!groups.length && <li className="muted">Ni skupin.</li>}
          </ul>
        </div>
      )}

      {p.groupIds.length > 0 && (
        <div className="chips">
          {p.groupIds.map((id) => (
            <button key={id} className="chip" onClick={() => toggle(id)} title="Odstrani">
              {byId.get(id)?.name ?? id} ✕
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
