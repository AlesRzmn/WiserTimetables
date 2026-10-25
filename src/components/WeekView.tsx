import { useEffect, useState } from 'react'
import type { CalEvent } from '../lib/types'
import type { Segment } from '../lib/data'
import { dayLabel, fmtMin, minutes, nowLocal, parseDate, timeOf, today } from '../lib/time'
import { typeHue } from '../lib/colors'

export type Lane = { id: string; label: string; color: string; events: CalEvent[] }

type Props = {
  days: string[]
  lanes: Lane[]
  segments?: Record<string, Segment[]>
  shared?: Set<string>
  /** Kompakten prikaz (tedenski pogled na telefonu) */
  compact?: boolean
  hasNote?: (ev: CalEvent) => boolean
  onEventClick: (ev: CalEvent, laneId: string) => void
  onSlotClick?: (date: string, minute: number) => void
  onDayClick?: (date: string) => void
}

/** Standardno okno urnika, enako za vse fakultete. */
const DAY_FROM = 7 * 60
const DAY_TO = 20 * 60
/** Termin, ki se le delno prekriva z oknom, ga lahko razširi največ do teh meja. */
const EXT_FROM = 6 * 60
const EXT_TO = 22 * 60

const DOW = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob']

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

/** Termin je v celoti zunaj okna (npr. Wisove »Rezervacije« ob 20:50) ali čez ves dan. */
export const isOutside = (e: CalEvent) =>
  minutes(e.start) >= DAY_TO || minutes(e.end) <= DAY_FROM || minutes(e.end) - minutes(e.start) >= 10 * 60
    || e.end.slice(0, 10) !== e.start.slice(0, 10)

function useViewportHeight() {
  const [h, setH] = useState(window.innerHeight)
  useEffect(() => {
    const on = () => setH(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}

export function WeekView({ days, lanes, segments, shared, compact, hasNote, onEventClick, onSlotClick, onDayClick }: Props) {
  const [now, setNow] = useState(nowLocal())
  const vh = useViewportHeight()
  useEffect(() => {
    const t = setInterval(() => setNow(nowLocal()), 60_000)
    return () => clearInterval(t)
  }, [])

  const narrow = window.matchMedia('(max-width: 760px)').matches
  const inDays = (e: CalEvent) => days.includes(e.start.slice(0, 10))
  const all = lanes.flatMap((l) => l.events).filter(inDays)
  const inside = all.filter((e) => !isOutside(e))

  // Okno 7–20; razširi se le za termine, ki se delno prekrivajo z njim (npr. 18:05–20:40).
  const from = Math.max(EXT_FROM, Math.min(DAY_FROM, ...inside.map((e) => Math.floor(minutes(e.start) / 60) * 60)))
  const to = Math.min(EXT_TO, Math.max(DAY_TO, ...inside.map((e) => Math.ceil(minutes(e.end) / 60) * 60)))

  // Višina se prilagodi zaslonu: na telefonu cel urnik brez drsenja, na računalniku udobna velikost.
  const reserved = narrow ? 215 : 250
  const fit = (vh - reserved) / (to - from)
  const pxPerMin = narrow ? Math.min(1.1, Math.max(compact ? 0.62 : 0.55, fit)) : Math.min(1.15, Math.max(0.8, fit))

  const height = (to - from) * pxPerMin
  const y = (m: number) => (Math.min(Math.max(m, from), to) - from) * pxPerMin
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)
  const multi = lanes.length > 1
  const todayStr = today()

  return (
    <div className={`week ${multi ? 'is-compare' : ''} ${compact ? 'is-compact' : ''}`} style={{ ['--days' as string]: days.length }}>
      <div className="week-head">
        <div className="time-gutter" />
        {days.map((d) => {
          const out = lanes.flatMap((l) => l.events.filter((e) => e.start.startsWith(d) && isOutside(e)).map((ev) => ({ ev, lane: l })))
          return (
            <div key={d} className={`day-head ${d === todayStr ? 'is-today' : ''}`}>
              {compact ? (
                <button className="day-head-btn" onClick={() => onDayClick?.(d)}>
                  {DOW[parseDate(d).getDay()]} <b>{Number(d.slice(8))}</b>
                </button>
              ) : (
                <span>{dayLabel(d)}</span>
              )}
              {multi && !compact && (
                <div className="lane-heads">
                  {lanes.map((l) => <span key={l.id} style={{ color: l.color }}>{l.label}</span>)}
                </div>
              )}
              {out.length > 0 && (
                <div className="outside">
                  {out.map(({ ev, lane }) => (
                    <button
                      key={lane.id + ev.key}
                      className="outside-ev"
                      style={multi ? { borderColor: lane.color } : undefined}
                      onClick={() => onEventClick(ev, lane.id)}
                      title={`${ev.title} ${timeOf(ev.start)}–${timeOf(ev.end)}`}
                    >
                      {compact ? timeOf(ev.start) : <>{timeOf(ev.start)} {ev.title}</>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="week-body" style={{ height }}>
        <div className="time-gutter">
          {hours.map((h) => (
            <span key={h} className="hour-label" style={{ top: y(h) }}>{compact ? h / 60 : fmtMin(h)}</span>
          ))}
        </div>

        {days.map((d) => (
          <div
            key={d}
            className={`day-col ${d === todayStr ? 'is-today' : ''}`}
            onDoubleClick={(e) => {
              if (!onSlotClick || e.target !== e.currentTarget) return
              const rect = e.currentTarget.getBoundingClientRect()
              const m = from + (e.clientY - rect.top) / pxPerMin
              onSlotClick(d, Math.floor(m / 15) * 15)
            }}
          >
            {hours.map((h) => <div key={h} className="hour-line" style={{ top: y(h) }} />)}

            {segments?.[d]?.filter((s) => s.kind === 'free').map((s) => (
              <div
                key={`${s.from}`}
                className="seg seg-free"
                style={{ top: y(s.from), height: y(s.to) - y(s.from) }}
                title={`Oba prosta ${fmtMin(s.from)}–${fmtMin(s.to)}`}
              >
                {!compact && s.to - s.from >= 30 && <span className="seg-label">prosta {fmtMin(s.from)}–{fmtMin(s.to)}</span>}
              </div>
            ))}

            <div className="lanes">
              {lanes.map((lane) => (
                <div key={lane.id} className="lane">
                  {layout(lane.events.filter((e) => e.start.slice(0, 10) === d && !isOutside(e))).map(({ ev, col, cols }) => {
                    const top = y(minutes(ev.start))
                    const h = Math.max(compact ? 14 : 18, y(minutes(ev.end)) - top - 2)
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
                          {!compact && ev.changed === 'del' && <span className="tag tag-del">odpade</span>}
                          {!compact && ev.changed === 'mod' && <span className="tag tag-mod">spremenjeno</span>}
                          {!compact && ev.changed === 'add' && <span className="tag tag-add">novo</span>}
                          {!compact && isShared && <span className="tag tag-shared">skupaj</span>}
                          {compact ? shortTitle(ev.title) : ev.title}
                          {ev.typeFull && <span className="ev-type"> {compact ? ev.type : `(${ev.typeFull})`}</span>}
                          {!compact && hasNote?.(ev) && <span className="ev-note-dot" title="Ima opombo">✎</span>}
                        </span>
                        {!compact && (
                          <span className="ev-meta">
                            {timeOf(ev.start)}–{timeOf(ev.end)}
                            {ev.rooms.length > 0 && <> · {ev.rooms.join(', ')}</>}
                          </span>
                        )}
                        {compact && ev.rooms.length > 0 && <span className="ev-meta">{ev.rooms[0]}</span>}
                        {!multi && !compact && ev.lecturers.length > 0 && <span className="ev-meta ev-lect">{ev.lecturers.join(', ')}</span>}
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

/** "MATEMATIČNA ANALIZA" → "MAT. ANALIZA" za ozke stolpce */
function shortTitle(t: string) {
  if (t.length <= 14) return t
  return t.split(' ').map((w, i, a) => (i < a.length - 1 && w.length > 5 ? w.slice(0, 4) + '.' : w)).join(' ')
}
