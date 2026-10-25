export type Programme = { id: string; name: string; years?: string[] }

export type Group = {
  id: string
  name: string
  /** ID nadrejene skupine (npr. "STR UN 1. l." za "STR UN 1. l. - 7.sk.") */
  parent: string | null
  progs: string[]
  years: string[]
}

export type Catalog = { programmes: Programme[]; groups: Group[]; fetchedAt: string }

export type Faculty = {
  key: string
  code: string
  name: string
  groups: number
  events: number
  eventsAt: string
  catalogAt: string
  error?: string
}

export type FacultiesFile = { updatedAt: string; faculties: Faculty[] }

/** Dogodek iz Wise (razpakiran). Časi so lokalni: "2026-10-02T08:55". */
export type WEvent = {
  uid: string
  start: string
  end: string
  course: string
  /** Kratka oznaka tipa: PR, AV, LV, RV, SE … */
  type: string
  /** Celotna oznaka, npr. "SE (od A do G)" ali "LV 2" */
  typeFull: string
  rooms: string[]
  lecturers: string[]
  groups: string[]
  note: string
}

export type PackedEvents = {
  fetchedAt: string
  courses: string[]
  rooms: string[]
  lecturers: string[]
  groups: string[]
  events: [string, string, string, number, string, number[], number[], number[], string][]
}

export type Change = {
  kind: 'add' | 'del' | 'mod'
  uid: string
  at: string
  ev: WEvent
  old?: WEvent
  fields?: string[]
}

/** Oseba, katere urnik spremljamo: jaz ali prijatelj. */
export type Profile = {
  id: string
  name: string
  color: string
  isMe: boolean
  faculty: string
  programme: string
  year: string
  groupIds: string[]
}

/** Lasten dogodek (samo za "jaz"). */
export type CustomEvent = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string
  repeatUntil?: string // ponavljaj tedensko do tega datuma
  color: string
  note?: string
}

/** Dogodek, kot ga riše koledar (Wise ali lasten). */
export type CalEvent = {
  key: string
  start: string
  end: string
  title: string
  type: string
  typeFull: string
  rooms: string[]
  lecturers: string[]
  groups: string[]
  note: string
  source: 'wise' | 'custom'
  wise?: WEvent
  custom?: CustomEvent
  color?: string
  changed?: Change['kind']
}
