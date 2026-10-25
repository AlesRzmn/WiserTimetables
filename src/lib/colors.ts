// Barve za tipe izvedb in za prijatelje.

const TYPE_HUE: Record<string, number> = {
  PR: 212, // predavanja – modra
  AV: 160, // avditorne vaje – zelenomodra
  LV: 32, // laboratorijske – oranžna
  RV: 280, // računalniške – vijolična
  SE: 340, // seminar – roza
  SV: 95, // seminarske vaje – zelena
  VAJE: 160,
  TE: 50,
}

export function typeHue(type: string) {
  if (type in TYPE_HUE) return TYPE_HUE[type]
  let h = 0
  for (const ch of type) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export const PROFILE_COLORS = ['#2f6fed', '#e0752d', '#16a37a', '#c2410c', '#9333ea', '#db2777', '#0891b2', '#65a30d']

export const TYPE_NAMES: Record<string, string> = {
  PR: 'predavanja',
  AV: 'avditorne vaje',
  LV: 'laboratorijske vaje',
  RV: 'računalniške vaje',
  SE: 'seminar',
  SV: 'seminarske vaje',
}
