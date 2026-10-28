// Izmišljene fakultete, ki niso na Wise (za šalo). Zapišejo se v enakem
// formatu kot prave, zato jih aplikacija prikaže kot vse ostale.

function localDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400e3)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** Vsak dan od 7:00 do 20:00 isti termin, 30 dni nazaj in 180 dni naprej. */
function everyDay({ key, course, group }) {
  const events = []
  for (let i = -30; i <= 180; i++) {
    const d = localDate(i)
    events.push({
      uid: `${key}-${d.replace(/-/g, '')}@custom`, // stalen UID → ni lažnih »sprememb«
      start: `${d}T07:00`, end: `${d}T20:00`,
      course, type: '', typeFull: '', rooms: [], lecturers: [], groups: [group], note: '',
    })
  }
  return events
}

export const CUSTOM_FACULTIES = [
  {
    key: 'jager',
    name: 'Jager',
    catalog: {
      programmes: [{ id: 'jager', name: 'Jager', years: [] }],
      groups: [{ id: 'jager', name: 'Jager', parent: null, progs: ['jager'], years: [] }],
    },
    events: () => everyDay({ key: 'jager', course: 'Zlaganje pijače', group: 'Jager' }),
  },
]

