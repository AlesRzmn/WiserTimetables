import { useEffect, useMemo, useState } from 'react'
import type { CalEvent, Change, CustomEvent, Faculty, Profile } from './lib/types'
import {
  busyOnDay, compareDay, courseKey, datesOfWeek, expandCustom, isHidden, isWeekend, loadFaculties,
  loadProfileData, toCal, type ProfileData, type Segment,
} from './lib/data'
import { addDays, nowLocal, parseDate, relTime, today, weekLabel, weekStart } from './lib/time'
import { exportAll, importAll, uid, useStored } from './lib/storage'
import { PROFILE_COLORS } from './lib/colors'
import { changeDetails, changeTitle } from './lib/changes'
import { WeekView, type Lane } from './components/WeekView'
import { ProfileEditor } from './components/ProfileEditor'
import { EventDialog, type Notes } from './components/EventDialog'
import { CustomEventEditor } from './components/CustomEventEditor'
import { CourseFilter } from './components/CourseFilter'
import { ChangesPanel } from './components/ChangesPanel'
import { Modal } from './components/Modal'

type Dialog =
  | { kind: 'profile'; profile: Profile; isNew: boolean }
  | { kind: 'event'; ev: CalEvent; laneId: string }
  | { kind: 'custom'; ev: CustomEvent; isNew: boolean }
  | { kind: 'courses'; profileId: string }
  | { kind: 'changes' }
  | { kind: 'people' }
  | { kind: 'data' }
  | null

const NEW_PROFILE = (isMe: boolean, n: number): Profile => ({
  id: uid(), name: isMe ? 'Jaz' : '', color: PROFILE_COLORS[n % PROFILE_COLORS.length], isMe,
  faculty: '', programme: '', year: '', groupIds: [],
})

const useIsNarrow = () => {
  const q = '(max-width: 760px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

export default function App() {
  const [profiles, setProfiles] = useStored<Profile[]>('profiles', [])
  const [hidden, setHidden] = useStored<Record<string, string[]>>('hidden', {})
  const [custom, setCustom] = useStored<CustomEvent[]>('custom', [])
  const [notes, setNotes] = useStored<Notes>('notes', { byUid: {}, byCourse: {} })
  const [seenChanges, setSeenChanges] = useStored<string>('seenChanges', '')
  const [viewId, setViewId] = useStored<string>('view', '')
  const [compareId, setCompareId] = useStored<string>('compare', '')

  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loadError, setLoadError] = useState('')
  const [week, setWeek] = useState(() => weekStart(today()))
  const [day, setDay] = useState(today())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [data, setData] = useState<Record<string, ProfileData>>({})
  const narrow = useIsNarrow()

  // Spustni meniji (<details class="menu">) se zaprejo ob izbiri ali kliku drugam.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      document.querySelectorAll<HTMLDetailsElement>('details.menu[open]').forEach((d) => {
        if (!d.contains(target) || target.closest('.menu-list button')) d.open = false
      })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  const me = profiles.find((p) => p.isMe)
  const viewed = profiles.find((p) => p.id === viewId) ?? me
  const compared = profiles.find((p) => p.id === compareId && p.id !== viewed?.id)

  // --- nalaganje podatkov ---
  useEffect(() => {
    loadFaculties()
      .then((f) => { setFaculties(f.faculties); setUpdatedAt(f.updatedAt) })
      .catch((e) => setLoadError(`Podatkov o urnikih ni bilo mogoče naložiti (${e.message}).`))
  }, [])

  useEffect(() => {
    for (const p of [viewed, compared, me]) {
      if (!p || !p.faculty || !p.groupIds.length) continue
      const stale = data[p.id]?.profile !== p
      if (!stale) continue
      loadProfileData(p)
        .then((d) => setData((x) => ({ ...x, [p.id]: d })))
        .catch((e) => setLoadError(`${p.name}: ${e.message}`))
    }
  }, [viewed, compared, me, data])

  // Prvi zagon: vprašaj po lastnem urniku
  useEffect(() => {
    if (!me && faculties.length && !dialog) setDialog({ kind: 'profile', profile: NEW_PROFILE(true, 0), isNew: true })
  }, [me, faculties, dialog])

  // --- spremembe, ki me zadevajo ---
  const myChanges = useMemo(() => {
    const d = me && data[me.id]
    if (!d) return []
    const hid = hidden[me.id] ?? []
    const now = nowLocal()
    return d.changes.filter((c) => !isHidden(c.ev, hid) && (c.ev.end >= now || (c.old && c.old.end >= now)))
  }, [me, data, hidden])
  const unseen = myChanges.filter((c) => c.at > seenChanges)

  // Obvestilo brskalnika ob odprtju, če so nove spremembe
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  useEffect(() => {
    if (notif !== 'granted' || !unseen.length) return
    const key = 'um-urnik:notified'
    const last = localStorage.getItem(key) || ''
    const fresh = unseen.filter((c) => c.at > last)
    if (!fresh.length) return
    const c = fresh[0]
    const t = changeTitle(c)
    try {
      new Notification(`${t.label}: ${t.text}`, {
        body: fresh.length > 1 ? `${changeDetails(c)[0]}\n+ še ${fresh.length - 1} sprememb` : changeDetails(c).join('\n'),
        tag: 'um-urnik',
      })
      localStorage.setItem(key, fresh.map((x) => x.at).sort().at(-1)!)
    } catch { /* nekateri mobilni brskalniki tega ne podpirajo */ }
  }, [notif, unseen])

  // --- dogodki za prikaz ---
  const range = { from: week, to: addDays(week, 6) }
  const eventsFor = (p: Profile | undefined): CalEvent[] => {
    if (!p) return []
    const d = data[p.id]
    const hid = hidden[p.id] ?? []
    const changeOf = new Map<string, Change['kind']>()
    if (d) {
      const recent = new Date(Date.now() - 7 * 86400e3).toISOString()
      for (const c of d.changes) if (c.at >= recent) changeOf.set(c.uid, c.kind)
    }
    const wise = (d?.events ?? [])
      .filter((e) => e.start.slice(0, 10) >= range.from && e.start.slice(0, 10) <= range.to && !isHidden(e, hid))
      .map((e) => toCal(e, changeOf.get(e.uid)))
    // Odpadli termini (izbrisani iz Wise v zadnjem tednu) ostanejo vidni, prečrtani.
    const deleted = (d?.changes ?? [])
      .filter((c) => c.kind === 'del' && changeOf.get(c.uid) === 'del' && c.ev.start.slice(0, 10) >= range.from && c.ev.start.slice(0, 10) <= range.to && !isHidden(c.ev, hid))
      .map((c) => toCal(c.ev, 'del'))
    const own = p.isMe ? expandCustom(custom, range.from, range.to) : []
    return [...wise, ...deleted, ...own]
  }

  const viewedEvents = useMemo(() => eventsFor(viewed), [viewed, data, hidden, custom, week]) // eslint-disable-line react-hooks/exhaustive-deps
  const comparedEvents = useMemo(() => eventsFor(compared), [compared, data, hidden, custom, week]) // eslint-disable-line react-hooks/exhaustive-deps

  let days = datesOfWeek(week)
  const hasWeekend = (d: string) => [...viewedEvents, ...comparedEvents].some((e) => e.start.startsWith(d))
  days = days.filter((d) => !isWeekend(d) || hasWeekend(d))
  if (narrow) days = [days.includes(day) ? day : days[0]]

  const lanes: Lane[] = []
  if (viewed) lanes.push({ id: viewed.id, label: viewed.name, color: viewed.color, events: viewedEvents.filter((e) => e.changed !== 'del' || !compared) })
  if (compared) lanes.push({ id: compared.id, label: compared.name, color: compared.color, events: comparedEvents.filter((e) => e.changed !== 'del') })

  // --- primerjava ---
  const compare = useMemo(() => {
    if (!compared || !viewed) return null
    const a = viewedEvents.filter((e) => e.changed !== 'del')
    const b = comparedEvents.filter((e) => e.changed !== 'del')
    const segments: Record<string, Segment[]> = {}
    const summary: { day: string; free: Segment[]; shared: CalEvent[] }[] = []
    const shared = new Set(a.filter((e) => e.source === 'wise' && b.some((x) => x.key === e.key)).map((e) => e.key))
    for (const d of datesOfWeek(week).filter((x) => !isWeekend(x) || hasWeekend(x))) {
      const ba = busyOnDay(a, d)
      const bb = busyOnDay(b, d)
      const all = [...ba, ...bb]
      // Gledamo samo čas med prvim in zadnjim terminom obeh – zjutraj in zvečer sta tako ali tako prosta.
      if (!all.length) { summary.push({ day: d, free: [], shared: [] }); continue }
      const first = Math.min(...all.map((x) => x[0]))
      const last = Math.max(...all.map((x) => x[1]))
      segments[d] = compareDay(ba, bb, first, last)
      const free = segments[d].filter((s) => s.kind === 'free' && s.to - s.from >= 15)
      summary.push({ day: d, free, shared: a.filter((e) => shared.has(e.key) && e.start.startsWith(d)) })
    }
    return { segments, summary, shared }
  }, [compared, viewed, viewedEvents, comparedEvents, week]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- akcije ---
  const saveProfile = (p: Profile) => {
    setProfiles((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]))
    setDialog(profiles.length ? { kind: 'people' } : null)
    if (p.isMe && !viewId) setViewId(p.id)
  }
  const deleteProfile = (p: Profile) => {
    if (!confirm(`Odstranim ${p.name}?`)) return
    setProfiles((list) => list.filter((x) => x.id !== p.id))
    if (viewId === p.id) setViewId('')
    if (compareId === p.id) setCompareId('')
    setDialog({ kind: 'people' })
  }
  const hideCourse = (profileId: string, course: string, typeFull?: string) =>
    setHidden((h) => ({ ...h, [profileId]: [...(h[profileId] ?? []), courseKey(course, typeFull)] }))

  const openChanges = () => {
    setDialog({ kind: 'changes' })
    if (myChanges.length) setSeenChanges(myChanges.map((c) => c.at).sort().at(-1)!)
  }

  const newCustom = (date = today(), minute = 16 * 60): CustomEvent => {
    const h = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    return { id: uid(), title: '', date, start: h(minute), end: h(minute + 60), color: PROFILE_COLORS[2] }
  }

  const go = (n: number) => {
    if (narrow) {
      const d = addDays(day, n)
      setDay(d)
      setWeek(weekStart(d))
    } else setWeek(addDays(week, 7 * n))
  }
  const goToday = () => { setWeek(weekStart(today())); setDay(today()) }

  const viewedData = viewed && data[viewed.id]
  const fetchedAt = viewedData?.fetchedAt
  const isMineView = !!viewed?.isMe

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◷</span>
          <span>UM urnik</span>
        </div>

        <nav className="weeknav">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Nazaj">‹</button>
          <button className="btn btn-small" onClick={goToday}>Danes</button>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Naprej">›</button>
          <span className="week-label">{weekLabel(week)}</span>
        </nav>

        <div className="top-actions">
          <button className="icon-btn bell" onClick={openChanges} aria-label="Spremembe urnika" title="Spremembe urnika">
            🔔{unseen.length > 0 && <span className="badge">{unseen.length}</span>}
          </button>
          <details className="menu menu-right">
            <summary className="icon-btn" aria-label="Meni">☰</summary>
            <div className="menu-list">
              <button onClick={() => setDialog({ kind: 'people' })}>👥 Jaz in prijatelji</button>
              {viewed && <button onClick={() => setDialog({ kind: 'courses', profileId: viewed.id })}>📚 Predmeti ({viewed.name})</button>}
              {me && <button onClick={() => setDialog({ kind: 'custom', ev: newCustom(), isNew: true })}>➕ Lasten dogodek</button>}
              <button onClick={() => setDialog({ kind: 'data' })}>💾 Varnostna kopija</button>
            </div>
          </details>
        </div>
      </header>

      <section className="toolbar">
        <div className="people">
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`person ${viewed?.id === p.id ? 'is-on' : ''}`}
              style={{ ['--c' as string]: p.color }}
              onClick={() => { setViewId(p.id); if (compareId === p.id) setCompareId('') }}
            >
              <span className="dot" />{p.name}
            </button>
          ))}
          <button className="person person-add" onClick={() => setDialog({ kind: 'profile', profile: NEW_PROFILE(false, profiles.length), isNew: true })}>
            + prijatelj
          </button>
        </div>
        {profiles.length > 1 && viewed && (
          <label className="compare-select">
            <span>Primerjaj z</span>
            <select value={compared?.id ?? ''} onChange={(e) => setCompareId(e.target.value)}>
              <option value="">—</option>
              {profiles.filter((p) => p.id !== viewed.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </section>

      {narrow && (
        <div className="day-strip">
          {datesOfWeek(week).filter((d) => !isWeekend(d) || hasWeekend(d)).map((d) => (
            <button key={d} className={`${d === days[0] ? 'is-on' : ''} ${d === today() ? 'is-today' : ''}`} onClick={() => setDay(d)}>
              {DOW[parseDate(d).getDay()]}
              <b>{Number(d.slice(8))}</b>
            </button>
          ))}
        </div>
      )}

      {loadError && <p className="error banner">{loadError}</p>}

      {unseen.length > 0 && (
        <button className="banner banner-mod change-banner" onClick={openChanges}>
          <b>{unseen.length === 1 ? '1 nova sprememba' : `${unseen.length} novih sprememb`} v tvojem urniku</b>
          <span>{changeTitle(unseen[0]).label}: {changeTitle(unseen[0]).text} · {changeDetails(unseen[0])[0]}</span>
        </button>
      )}

      <main className="main">
        {viewed && !viewedData && viewed.groupIds.length > 0 && !loadError && <p className="muted center">Nalagam urnik …</p>}
        {viewed && (
          <WeekView
            days={days}
            lanes={lanes}
            segments={compare?.segments}
            shared={compare?.shared}
            hasNote={(ev) => !!(notes.byUid[ev.key] || (ev.source === 'wise' && notes.byCourse[ev.title]))}
            onEventClick={(ev, laneId) => setDialog({ kind: 'event', ev, laneId })}
            onSlotClick={isMineView && !compared ? (d, m) => setDialog({ kind: 'custom', ev: newCustom(d, m), isNew: true }) : undefined}
          />
        )}

        {compare && compared && viewed && (
          <section className="compare-summary">
            <h3>
              <span style={{ color: viewed.color }}>{viewed.name}</span> in <span style={{ color: compared.color }}>{compared.name}</span> ta teden
            </h3>
            <div className="legend">
              <span className="lg lg-free">oba prosta</span>
              <span className="lg lg-a" style={{ ['--c' as string]: viewed.color }}>samo {viewed.name}</span>
              <span className="lg lg-b" style={{ ['--c' as string]: compared.color }}>samo {compared.name}</span>
              <span className="lg lg-both">oba zasedena</span>
            </div>
            <ul>
              {compare.summary.map((s) => (
                <li key={s.day}>
                  <b>{DOW[parseDate(s.day).getDay()]}</b>
                  {s.free.length
                    ? <span>skupaj prosta: {s.free.map((f) => `${fmt(f.from)}–${fmt(f.to)}`).join(', ')}</span>
                    : <span className="muted">ni skupnih lukenj med predavanji</span>}
                  {s.shared.length > 0 && <span className="shared-list">skupaj na: {[...new Set(s.shared.map((e) => `${e.title}${e.typeFull ? ` (${e.typeFull})` : ''}`))].join(', ')}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="foot muted small">
        {fetchedAt ? <>Podatki iz Wise Timetable, osveženi {relTime(fetchedAt)}.</> : updatedAt && <>Podatki osveženi {relTime(updatedAt)}.</>}
        {' '}Neuradna aplikacija – v primeru dvoma velja <a href="https://www.wise-tt.com/" target="_blank" rel="noreferrer">uradni urnik</a>.
      </footer>

      {/* ------------------------------ dialogi ------------------------------ */}
      {dialog?.kind === 'profile' && (
        <ProfileEditor
          key={dialog.profile.id}
          initial={dialog.profile}
          faculties={faculties}
          isNew={dialog.isNew}
          onSave={saveProfile}
          onDelete={!dialog.isNew && !dialog.profile.isMe ? () => deleteProfile(dialog.profile) : undefined}
          onClose={me || !dialog.profile.isMe ? () => setDialog(profiles.length ? { kind: 'people' } : null) : undefined}
        />
      )}

      {dialog?.kind === 'people' && (
        <Modal title="Jaz in prijatelji" onClose={() => setDialog(null)} footer={
          <>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => setDialog({ kind: 'profile', profile: NEW_PROFILE(false, profiles.length), isNew: true })}>+ Dodaj prijatelja</button>
          </>
        }>
          <p className="muted small">Prijatelje dodaš sam: izberi njihovo fakulteto, program in skupino. Nihče ne potrebuje računa.</p>
          <ul className="people-list">
            {profiles.map((p) => {
              const f = faculties.find((x) => x.key === p.faculty)
              return (
                <li key={p.id}>
                  <span className="dot" style={{ background: p.color }} />
                  <div>
                    <b>{p.name}</b>{p.isMe && <span className="muted"> (jaz)</span>}
                    <div className="muted small">{f?.key.toUpperCase() ?? p.faculty} · {p.groupIds.length} skupin</div>
                  </div>
                  <span className="spacer" />
                  <button className="btn btn-small" onClick={() => setDialog({ kind: 'courses', profileId: p.id })}>Predmeti</button>
                  <button className="btn btn-small" onClick={() => setDialog({ kind: 'profile', profile: p, isNew: false })}>Uredi</button>
                </li>
              )
            })}
          </ul>
        </Modal>
      )}

      {dialog?.kind === 'courses' && (() => {
        const p = profiles.find((x) => x.id === dialog.profileId)
        const d = p && data[p.id]
        if (!p) return null
        return (
          <CourseFilter
            name={p.name}
            events={d?.events ?? []}
            hidden={hidden[p.id] ?? []}
            onChange={(h) => setHidden((x) => ({ ...x, [p.id]: h }))}
            onClose={() => setDialog(null)}
          />
        )
      })()}

      {dialog?.kind === 'event' && (() => {
        const owner = profiles.find((p) => p.id === dialog.laneId)
        const mine = !!owner?.isMe
        return (
          <EventDialog
            ev={dialog.ev}
            owner={owner?.name ?? ''}
            isMine={mine}
            notes={notes}
            onNotes={setNotes}
            onHideCourse={owner ? (c, t) => hideCourse(owner.id, c, t) : undefined}
            onEditCustom={dialog.ev.custom ? () => setDialog({ kind: 'custom', ev: dialog.ev.custom!, isNew: false }) : undefined}
            onClose={() => setDialog(null)}
          />
        )
      })()}

      {dialog?.kind === 'custom' && (
        <CustomEventEditor
          initial={dialog.ev}
          isNew={dialog.isNew}
          onSave={(c) => { setCustom((l) => (l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? c : x)) : [...l, c])); setDialog(null) }}
          onDelete={dialog.isNew ? undefined : () => { setCustom((l) => l.filter((x) => x.id !== dialog.ev.id)); setDialog(null) }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'changes' && (
        <ChangesPanel
          changes={myChanges}
          seenAt={seenChanges}
          notifState={notif}
          onEnableNotif={() => Notification.requestPermission().then(setNotif)}
          onOpen={(c) => {
            setWeek(weekStart(c.ev.start))
            setDay(c.ev.start.slice(0, 10))
            if (me) setViewId(me.id)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'data' && <DataDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

const DOW = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob']
const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

function DataDialog({ onClose }: { onClose: () => void }) {
  const [msg, setMsg] = useState('')
  const download = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `um-urnik-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const upload = (file: File) => {
    file.text().then((t) => {
      try {
        importAll(t)
        setMsg('Uvoženo. Stran se bo osvežila …')
        setTimeout(() => location.reload(), 600)
      } catch (e) {
        setMsg((e as Error).message)
      }
    })
  }
  return (
    <Modal title="Varnostna kopija" onClose={onClose}>
      <p className="muted">
        Vse (osebe, skriti predmeti, lastni dogodki in opombe) je shranjeno samo v tem brskalniku.
        Izvozi datoteko, da jo preneseš na drug telefon ali računalnik.
      </p>
      <div className="row">
        <button className="btn btn-primary" onClick={download}>Izvozi</button>
        <label className="btn">
          Uvozi …
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {msg && <p>{msg}</p>}
    </Modal>
  )
}

