import { useEffect, useState } from 'react'
import type { CalEvent } from '../lib/types'
import type { Segment } from '../lib/data'
import { dayLabel, fmtMin, minutes, nowLocal, timeOf, today } from '../lib/time'
import { typeHue } from '../lib/colors'

export type Lane = { id: string; label: string; color: string; events: CalEvent[] }

type Props = {
  days: string[]
  lanes: Lane[]
  segments?: Record<string, Segment[]>
  shared?: Set<string>
  hasNote?: (ev: CalEvent) => boolean
  onEventClick: (ev: CalEvent, laneId: string) => void
  onSlotClick?: (date: string, minute: number) => void
}

const PX_PER_MIN = 1.05

/** Razporedi prekrivajoče dogodke v stolpce (kot v Google koledarju). */
function layout(events: CalEvent[]) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const out: { ev: CalEvent; col: number; cols: number }[] = []
  let cluster: { ev: CalEvent; col: number }[] = []
  let colEnds: string[] = []
  let clusterEnd = ''
  const flush = () => {
    cluster.forEach((c) => out.push({ ...c, cols: colEnds.length }))
    cluster = []
    colEnds = []
    clusterEnd = ''
  }
  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= ev.start)
    if (col === -1) col = colEnds.length
    colEnds[col] = ev.end
    cluster.push({ ev, col })
    if (ev.end > clusterEnd) clusterEnd = ev.end
  }
  flush()
  return out
}

export function WeekView({ days, lanes, segments, shared, hasNote, onEventClick, onSlotClick }: Props) {
  const [now, setNow] = useState(nowLocal())
  useEffect(() => {
    const t = setInterval(() => setNow(nowLocal()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Prikazan časovni razpon: od prvega do zadnjega dogodka v tednu, vsaj 8–18.
  const all = lanes.flatMap((l) => l.events).filter((e) => days.includes(e.start.slice(0, 10)))
  const from = Math.min(8 * 60, ...all.map((e) => Math.floor(minutes(e.start) / 60) * 60))
  const to = Math.max(18 * 60, ...all.map((e) => Math.ceil(minutes(e.end) / 60) * 60))
  const height = (to - from) * PX_PER_MIN
  const y = (m: number) => (m - from) * PX_PER_MIN
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)
  const multi = lanes.length > 1
  const todayStr = today()

  return (
    <div className={`week ${multi ? 'is-compare' : ''}`} style={{ ['--days' as string]: days.length }}>
      <div className="week-head">
        <div className="time-gutter" />
        {days.map((d) => (
          <div key={d} className={`day-head ${d === todayStr ? 'is-today' : ''}`}>
            <span>{dayLabel(d)}</span>
            {multi && (
              <div className="lane-heads">
                {lanes.map((l) => (
                  <span key={l.id} style={{ color: l.color }}>{l.label}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="week-body" style={{ height }}>
        <div className="time-gutter">
          {hours.map((h) => (
            <span key={h} className="hour-label" style={{ top: y(h) }}>{fmtMin(h)}</span>
          ))}
        </div>

        {days.map((d) => (
          <div
            key={d}
            className={`day-col ${d === todayStr ? 'is-today' : ''}`}
            onDoubleClick={(e) => {
              if (!onSlotClick || e.target !== e.currentTarget) return
              const rect = e.currentTarget.getBoundingClientRect()
              const m = from + (e.clientY - rect.top) / PX_PER_MIN
              onSlotClick(d, Math.floor(m / 15) * 15)
            }}
          >
            {hours.map((h) => <div key={h} className="hour-line" style={{ top: y(h) }} />)}

            {segments?.[d]?.map((s) => (
              <div
                key={`${s.from}`}
                className={`seg seg-${s.kind}`}
                style={{ top: y(s.from), height: (s.to - s.from) * PX_PER_MIN }}
                title={s.kind === 'free' ? `Oba prosta ${fmtMin(s.from)}–${fmtMin(s.to)}` : undefined}
              >
                {s.kind === 'free' && s.to - s.from >= 30 && (
                  <span className="seg-label">prosta {fmtMin(s.from)}–{fmtMin(s.to)}</span>
                )}
              </div>
            ))}

            <div className="lanes">
              {lanes.map((lane) => (
                <div key={lane.id} className="lane">
                  {layout(lane.events.filter((e) => e.start.slice(0, 10) === d)).map(({ ev, col, cols }) => {
                    const top = y(minutes(ev.start))
                    const h = Math.max(18, (minutes(ev.end) - minutes(ev.start)) * PX_PER_MIN - 2)
                    const hue = ev.color ? null : typeHue(ev.type)
                    const isShared = multi && shared?.has(ev.key)
                    return (
                      <button
                        key={ev.key}
                        className={[
                          'ev', `ev-${ev.source}`, ev.changed ? `ev-changed ev-${ev.changed}` : '',
                          isShared ? 'ev-shared' : '', h < 44 ? 'ev-short' : '',
                          ev.end <= now ? 'ev-past' : '',
                        ].join(' ')}
                        style={{
                          top, height: h,
                          left: `calc(${(col / cols) * 100}% + 1px)`,
                          width: `calc(${100 / cols}% - 2px)`,
                          ...(hue !== null
                            ? { ['--h' as string]: hue }
                            : { ['--ev-bg' as string]: ev.color + '26', ['--ev-bd' as string]: ev.color }),
                          ...(multi ? { ['--lane' as string]: lane.color } : {}),
                        }}
                        onClick={() => onEventClick(ev, lane.id)}
                        title={`${ev.title}${ev.typeFull ? ` (${ev.typeFull})` : ''}\n${timeOf(ev.start)}–${timeOf(ev.end)} ${ev.rooms.join(', ')}`}
                      >
                        <span className="ev-title">
                          {ev.changed === 'del' && <span className="tag tag-del">odpade</span>}
                          {ev.changed === 'mod' && <span className="tag tag-mod">spremenjeno</span>}
                          {ev.changed === 'add' && <span className="tag tag-add">novo</span>}
                          {isShared && <span className="tag tag-shared">skupaj</span>}
                          {ev.title}
                          {ev.typeFull && <span className="ev-type"> ({ev.typeFull})</span>}
                          {hasNote?.(ev) && <span className="ev-note-dot" title="Ima opombo">✎</span>}
                        </span>
                        <span className="ev-meta">
                          {timeOf(ev.start)}–{timeOf(ev.end)}
                          {ev.rooms.length > 0 && <> · {ev.rooms.join(', ')}</>}
                        </span>
                        {!multi && ev.lecturers.length > 0 && <span className="ev-meta ev-lect">{ev.lecturers.join(', ')}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {d === todayStr && minutes(now) >= from && minutes(now) <= to && (
              <div className="now-line" style={{ top: y(minutes(now)) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
