// Delo z datumi. Vsi časi so lokalni nizi "YYYY-MM-DDTHH:MM" (ljubljanski čas),
// zato se izognemo zmedi s časovnimi pasovi.

export const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(dateStr: string, n: number) {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Ponedeljek tedna, v katerem je datum. */
export function weekStart(dateStr: string) {
  const d = parseDate(dateStr)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toDateStr(d)
}

export const today = () => toDateStr(new Date())

export function nowLocal() {
  const d = new Date()
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "HH:MM" ali "…THH:MM" → minute od polnoči */
export function minutes(s: string) {
  const t = s.length > 5 ? s.slice(11, 16) : s
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
export const timeOf = (s: string) => s.slice(11, 16)

const DAYS = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob']
const DAYS_LONG = ['nedelja', 'ponedeljek', 'torek', 'sreda', 'četrtek', 'petek', 'sobota']

export function dayLabel(dateStr: string, long = false) {
  const d = parseDate(dateStr)
  return `${(long ? DAYS_LONG : DAYS)[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`
}

export function weekLabel(start: string) {
  const end = addDays(start, 6)
  const a = parseDate(start)
  const b = parseDate(end)
  return `${a.getDate()}. ${a.getMonth() + 1}. – ${b.getDate()}. ${b.getMonth() + 1}. ${b.getFullYear()}`
}

export function relTime(iso: string) {
  const diff = (Date.now() - Date.parse(iso)) / 60000
  if (diff < 1) return 'pravkar'
  if (diff < 60) return `pred ${Math.round(diff)} min`
  if (diff < 60 * 24) return `pred ${Math.round(diff / 60)} h`
  const days = Math.round(diff / 60 / 24)
  return days === 1 ? 'včeraj' : `pred ${days} dnevi`
}
