// Prenos nastavitev na drugo napravo brez strežnika:
// vse nastavitve se stisnejo v povezavo (#uvoz=…). Del za # se nikoli ne pošlje
// strežniku, zato podatki ostanejo med napravama.
import { exportAll, importAll } from './storage'

const HASH_KEY = 'uvoz'

function toBase64Url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

export async function makeShareLink() {
  const json = exportAll(false)
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  const url = new URL(location.href)
  url.search = ''
  url.hash = `${HASH_KEY}=${toBase64Url(packed)}`
  return url.toString()
}

/** Prebere nastavitve iz povezave ali iz prilepljene kode/povezave. */
export async function readShared(input: string) {
  const m = input.match(new RegExp(`${HASH_KEY}=([A-Za-z0-9_-]+)`))
  const code = m ? m[1] : input.trim()
  const bytes = await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw'))
  const json = new TextDecoder().decode(bytes)
  const data = JSON.parse(json)
  if (data?.app !== 'um-urnik') throw new Error('Koda ni veljavna.')
  return { json, data }
}

export function sharedInHash() {
  return location.hash.includes(`${HASH_KEY}=`) ? location.hash : ''
}

export function clearHash() {
  history.replaceState(null, '', location.pathname + location.search)
}

export { importAll }
