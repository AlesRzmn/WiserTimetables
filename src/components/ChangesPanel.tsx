import type { Change } from '../lib/types'
import { changeDetails, changeTitle } from '../lib/changes'
import { relTime } from '../lib/time'
import { Modal } from './Modal'

type Props = {
  changes: Change[]
  seenAt: string
  onOpen: (c: Change) => void
  onClose: () => void
  notifState: NotificationPermission | 'unsupported'
  onEnableNotif: () => void
}

export function ChangesPanel({ changes, seenAt, onOpen, onClose, notifState, onEnableNotif }: Props) {
  const sorted = [...changes].sort((a, b) => b.at.localeCompare(a.at) || a.ev.start.localeCompare(b.ev.start))
  return (
    <Modal title="Spremembe urnika" onClose={onClose}>
      <p className="muted small">
        Spremembe, ki zadevajo tvoje skupine in predmete, za zadnje 3 tedne. Urnik se z Wise osveži večkrat na dan.
      </p>
      {notifState === 'default' && (
        <button className="btn btn-small" onClick={onEnableNotif}>🔔 Obvesti me ob novih spremembah</button>
      )}
      {notifState === 'denied' && <p className="muted small">Obvestila brskalnika so izklopljena v nastavitvah brskalnika.</p>}
      <ul className="change-list">
        {sorted.map((c) => {
          const t = changeTitle(c)
          return (
            <li key={`${c.uid}-${c.at}`} className={c.at > seenAt ? 'is-new' : ''}>
              <button onClick={() => onOpen(c)}>
                <span className={`tag tag-${t.tone}`}>{t.label}</span>
                <strong>{t.text}</strong>
                {changeDetails(c).map((d) => <span key={d} className="change-detail">{d}</span>)}
                <span className="muted small">zaznano {relTime(c.at)}</span>
              </button>
            </li>
          )
        })}
        {!sorted.length && <li className="empty">Ni sprememb. 🎉</li>}
      </ul>
    </Modal>
  )
}
