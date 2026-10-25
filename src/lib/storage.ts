import { useEffect, useState } from 'react'

const PREFIX = 'um-urnik:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* zasebni način ali poln disk: aplikacija dela naprej brez shranjevanja */
  }
}

/** useState, ki se shranjuje v localStorage. */
export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback))
  useEffect(() => save(key, value), [key, value])
  // Sinhronizacija med zavihki
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFIX + key && e.newValue) {
        try { setValue(JSON.parse(e.newValue)) } catch { /* ignoriraj */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])
  return [value, setValue] as const
}

/** Vsi podatki uporabnika za izvoz/uvoz (varnostna kopija, prenos na drug telefon). */
const EXPORT_KEYS = ['profiles', 'hidden', 'custom', 'notes', 'seenChanges', 'settings']

export function exportAll() {
  const data: Record<string, unknown> = { app: 'um-urnik', version: 1, exportedAt: new Date().toISOString() }
  for (const k of EXPORT_KEYS) data[k] = load(k, null)
  return JSON.stringify(data, null, 2)
}

export function importAll(json: string) {
  const data = JSON.parse(json)
  if (data?.app !== 'um-urnik') throw new Error('To ni izvoz aplikacije UM urnik.')
  for (const k of EXPORT_KEYS) if (data[k] != null) save(k, data[k])
}

export const uid = () => Math.random().toString(36).slice(2, 10)
