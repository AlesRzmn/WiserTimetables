import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { exportAll, importAll } from '../lib/storage'
import { makeShareLink, readShared } from '../lib/share'
import { today } from '../lib/time'
import { Modal } from './Modal'

/** Prenos nastavitev: povezava + QR koda, prilepljena koda ali datoteka. */
export function TransferDialog({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState('')
  const [qr, setQr] = useState('')
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState('')

  useEffect(() => {
    makeShareLink().then(async (l) => {
      setLink(l)
      try {
        setQr(await QRCode.toString(l, { type: 'svg', margin: 1, errorCorrectionLevel: 'L' }))
      } catch {
        setQr('') // preveč podatkov za QR kodo – ostane povezava
      }
    }).catch(() => setMsg('Ta brskalnik ne podpira stiskanja. Uporabi izvoz v datoteko.'))
  }, [])

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setMsg('Povezava kopirana.') } catch { setMsg('Kopiranje ni uspelo – označi povezavo ročno.') }
  }
  const share = () => navigator.share?.({ title: 'UM urnik – moje nastavitve', url: link }).catch(() => {})

  const importCode = async () => {
    try {
      const { json } = await readShared(paste)
      if (!confirm('Nastavitve v tem brskalniku bodo zamenjane z uvoženimi. Nadaljujem?')) return
      importAll(json)
      location.reload()
    } catch (e) {
      setMsg((e as Error).message.includes('veljavna') ? (e as Error).message : 'Koda ali povezava ni veljavna.')
    }
  }

  const download = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `um-urnik-${today()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const upload = (file: File) =>
    file.text().then((t) => {
      try {
        if (!confirm('Nastavitve v tem brskalniku bodo zamenjane z uvoženimi. Nadaljujem?')) return
        importAll(t)
        location.reload()
      } catch (e) { setMsg((e as Error).message) }
    })

  return (
    <Modal title="Prenos na drugo napravo" onClose={onClose} wide>
      <div className="transfer">
        <section>
          <h3>Pošlji s te naprave</h3>
          <p className="muted small">
            Skeniraj kodo s telefonom ali odpri povezavo v drugem brskalniku. Prenesejo se urniki,
            prijatelji, skriti predmeti, lastni dogodki in opombe. Tema in pogled ostaneta za vsako napravo svoja.
          </p>
          {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
          {link && (
            <div className="row">
              <input className="link-box" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={copy}>Kopiraj</button>
              {'share' in navigator && <button className="btn" onClick={share}>Deli …</button>}
            </div>
          )}
          <p className="muted small">Povezava vsebuje tvoje nastavitve – deli jo samo s sabo.</p>
        </section>
        <section>
          <h3>Prejmi na tej napravi</h3>
          <p className="muted small">Odpri povezavo z druge naprave ali jo prilepi sem.</p>
          <div className="row">
            <input className="link-box" placeholder="Prilepi povezavo …" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button className="btn btn-primary" disabled={!paste.trim()} onClick={importCode}>Uvozi</button>
          </div>
          <h3 className="mt">Datoteka</h3>
          <div className="row">
            <button className="btn" onClick={download}>Izvozi datoteko</button>
            <label className="btn">
              Uvozi datoteko …
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </section>
      </div>
      {msg && <p className="mt">{msg}</p>}
    </Modal>
  )
}

/** Prikaže se, ko odpreš povezavo z nastavitvami. */
export function IncomingDialog({ hash, onDone }: { hash: string; onDone: () => void }) {
  const [info, setInfo] = useState<{ json: string; people: string[]; custom: number; hidden: number; notes: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    readShared(hash).then(({ json, data }) => setInfo({
      json,
      people: (data.profiles ?? []).map((p: { name: string }) => p.name),
      custom: (data.custom ?? []).length,
      hidden: Object.values(data.hidden ?? {}).flat().length,
      notes: Object.keys(data.notes?.byUid ?? {}).length + Object.keys(data.notes?.byCourse ?? {}).length,
    })).catch(() => setError('Povezava je poškodovana ali nepopolna.'))
  }, [hash])

  return (
    <Modal title="Uvoz nastavitev" onClose={onDone} footer={
      <>
        <span className="spacer" />
        <button className="btn" onClick={onDone}>Prekliči</button>
        <button className="btn btn-primary" disabled={!info} onClick={() => { importAll(info!.json); onDone(); location.reload() }}>
          Uvozi
        </button>
      </>
    }>
      {error && <p className="error">{error}</p>}
      {info && (
        <>
          <p>Ta povezava vsebuje nastavitve z druge naprave:</p>
          <ul>
            <li>osebe: <b>{info.people.join(', ') || '—'}</b></li>
            <li>lastni dogodki: {info.custom}</li>
            <li>skriti predmeti: {info.hidden}</li>
            <li>opombe: {info.notes}</li>
          </ul>
          <p className="muted small">Trenutne nastavitve v tem brskalniku bodo zamenjane.</p>
        </>
      )}
    </Modal>
  )
}
