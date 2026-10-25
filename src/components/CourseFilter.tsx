import { useMemo } from 'react'
import type { WEvent } from '../lib/types'
import { courseKey } from '../lib/data'
import { typeHue } from '../lib/colors'
import { Modal } from './Modal'

type Props = {
  name: string
  events: WEvent[]
  hidden: string[]
  onChange: (hidden: string[]) => void
  onClose: () => void
}

/** Izbira predmetov in tipov izvedbe, ki jih oseba dejansko obiskuje. */
export function CourseFilter({ name, events, hidden, onChange, onClose }: Props) {
  const courses = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const e of events) {
      const types = map.get(e.course) ?? new Map<string, number>()
      types.set(e.typeFull, (types.get(e.typeFull) ?? 0) + 1)
      map.set(e.course, types)
    }
    return [...map.entries()]
      .map(([course, types]) => ({ course, types: [...types.entries()].sort((a, b) => a[0].localeCompare(b[0])) }))
      .sort((a, b) => a.course.localeCompare(b.course, 'sl'))
  }, [events])

  const toggle = (key: string) =>
    onChange(hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key])

  return (
    <Modal title={`Predmeti – ${name}`} onClose={onClose} wide footer={
      <>
        <button className="btn" onClick={() => onChange([])} disabled={!hidden.length}>Pokaži vse</button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onClose}>Končano</button>
      </>
    }>
      <p className="muted">
        Odkljukaj predmete ali posamezne izvedbe (npr. tuj jezik, ki ga ne obiskuješ). Številka pove, koliko terminov je v semestru.
      </p>
      <ul className="course-list">
        {courses.map(({ course, types }) => {
          const off = hidden.includes(courseKey(course))
          return (
            <li key={course} className={off ? 'is-off' : ''}>
              <label className="course-row">
                <input type="checkbox" checked={!off} onChange={() => toggle(courseKey(course))} />
                <strong>{course}</strong>
              </label>
              <div className="type-row">
                {types.map(([t, n]) => {
                  const key = courseKey(course, t)
                  const tOff = off || hidden.includes(key)
                  return (
                    <button
                      key={t}
                      className={`type-chip ${tOff ? 'is-off' : ''}`}
                      style={{ ['--h' as string]: typeHue((t.match(/^[A-ZČŠŽ]+/) || [''])[0]) }}
                      disabled={off}
                      onClick={() => toggle(key)}
                      title={tOff ? 'Skrito – klikni za prikaz' : 'Prikazano – klikni za skritje'}
                    >
                      {t || 'brez oznake'} <span className="count">{n}</span>
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
        {!courses.length && <li className="muted">Ni dogodkov.</li>}
      </ul>
    </Modal>
  )
}
