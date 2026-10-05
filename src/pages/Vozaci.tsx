import { useState, type FormEvent } from 'react'
import { CheckField, FormError, TextField } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { errorText, getApi } from '../lib/api'
import { SECTIONS, SECTION_COPY, vehiclesIn } from '../lib/sections'
import type { Driver, Vehicle } from '../lib/types'

const formatCode = (code: string): string => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code)
const loginLink = (code: string): string => `${window.location.origin}/?k=${code}`

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

interface Props {
  drivers: Driver[]
  vehicles: Vehicle[]
  onChanged: () => Promise<void>
}

type Dialog =
  | { kind: 'form'; driver: Driver | null }
  | { kind: 'pin'; driver: Driver }
  | { kind: 'share'; name: string; code: string; pin: string | null }

export function Vozaci({ drivers, vehicles, onChanged }: Props) {
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const nameOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '?'

  async function remove(d: Driver) {
    if (!window.confirm(`Obrisati vozača „${d.name}“? Njegovi dosadašnji unosi ostaju sačuvani.`)) return
    try {
      await getApi().owner.deleteDriver(d.id)
      await onChanged()
      toast('Vozač je obrisan.')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-title">Vozači</h2>
        <p className="muted">
          Vozač se prijavljuje <strong>kodom i PIN-om</strong>, bez naloga. Može da upiše bilo koji trošak, ali ne vidi ništa što je ranije uneto, nikakve zbirove, grafikone ni cene.
          Sve to vidite samo vi.
        </p>
        <div className="page-actions">
          <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'form', driver: null })}>
            <Icon name="plus" size={18} /> Dodaj vozača
          </button>
        </div>
      </section>

      {drivers.length === 0 ? (
        <div className="card empty">
          <p>Još nema vozača.</p>
        </div>
      ) : (
        <ul className="stack">
          {drivers.map((d) => (
            <li key={d.id} className="card driver">
              <div className="vehicle-head">
                <div>
                  <h3>{d.name}</h3>
                  <p className="muted">{d.vehicle_ids.length ? d.vehicle_ids.map(nameOf).join(', ') : 'Nema dodeljenih vozila'}</p>
                </div>
                <span className={`badge ${d.active ? 'badge--ok' : 'badge--soon'}`}>{d.active ? 'Aktivan' : 'Isključen'}</span>
              </div>
              <p className="hint">
                Kod: <code>{formatCode(d.code)}</code>
              </p>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setDialog({ kind: 'share', name: d.name, code: d.code, pin: null })}>
                  <Icon name="copy" size={18} /> Link i kod
                </button>
                <button type="button" className="btn" onClick={() => setDialog({ kind: 'pin', driver: d })}>
                  <Icon name="key" size={18} /> Novi PIN
                </button>
                <button type="button" className="btn" onClick={() => setDialog({ kind: 'form', driver: d })}>
                  <Icon name="edit" size={18} /> Izmeni
                </button>
                <button type="button" className="btn btn--danger" onClick={() => remove(d)}>
                  <Icon name="trash" size={18} /> Obriši
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'form' && (
        <Modal title={dialog.driver ? 'Izmena vozača' : 'Novi vozač'} onClose={() => setDialog(null)}>
          <DriverForm
            initial={dialog.driver}
            vehicles={vehicles}
            onClose={() => setDialog(null)}
            onSaved={async (created) => {
              await onChanged()
              setDialog(created ? { kind: 'share', ...created } : null)
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'pin' && (
        <Modal title={`Novi PIN: ${dialog.driver.name}`} onClose={() => setDialog(null)}>
          <PinForm
            driver={dialog.driver}
            onClose={() => setDialog(null)}
            onSaved={async (share) => {
              await onChanged()
              setDialog({ kind: 'share', ...share })
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'share' && (
        <Modal title={`Podaci za prijavu: ${dialog.name}`} onClose={() => setDialog(null)}>
          <ShareBox code={dialog.code} pin={dialog.pin} onClose={() => setDialog(null)} />
        </Modal>
      )}
    </div>
  )
}

function DriverForm({
  initial, vehicles, onClose, onSaved,
}: {
  initial: Driver | null
  vehicles: Vehicle[]
  onClose: () => void
  onSaved: (created: { name: string; code: string; pin: string } | null) => Promise<void>
}) {
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [pin, setPin] = useState('')
  const [active, setActive] = useState(initial?.active ?? true)
  const [ids, setIds] = useState<string[]>(initial?.vehicle_ids ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) => setIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Upišite ime i prezime.'
    if (!initial && !/^[0-9]{4,8}$/.test(pin)) errs.pin = 'PIN mora imati od 4 do 8 cifara.'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      const api = getApi().owner
      if (initial) {
        await api.updateDriver(initial.id, { name: name.trim(), active, vehicleIds: ids })
        toast('Izmene su sačuvane.')
        await onSaved(null)
      } else {
        const created = await api.createDriver(name.trim(), pin, ids)
        await onSaved({ name: name.trim(), code: created.code, pin })
      }
    } catch (err) {
      setServerError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField label="Ime i prezime" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={60} />
      {!initial && (
        <TextField
          label="PIN (4 do 8 cifara)"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          error={errors.pin}
          hint="Vozač ga unosi pri svakom otvaranju aplikacije. Posle 5 pogrešnih pokušaja zaključava se na 15 minuta."
        />
      )}
      <fieldset className="fieldset">
        <legend>Koja vozila i mašine sme da koristi</legend>
        {vehicles.length === 0 && <p className="hint">Prvo dodajte vozilo ili mašinu.</p>}
        {SECTIONS.map((s) => {
          const list = vehiclesIn(vehicles, s)
          if (list.length === 0) return null
          return (
            <div key={s} className="checks">
              <p className="label">{SECTION_COPY[s].label}</p>
              {list.map((v) => (
                <CheckField key={v.id} label={v.name} checked={ids.includes(v.id)} onChange={() => toggle(v.id)} />
              ))}
            </div>
          )
        })}
      </fieldset>
      {initial && <CheckField label="Aktivan (može da se prijavi)" checked={active} onChange={(e) => setActive(e.target.checked)} />}
      <FormError text={serverError} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : initial ? 'Sačuvaj' : 'Napravi vozača'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Otkaži
        </button>
      </div>
    </form>
  )
}

function PinForm({
  driver, onClose, onSaved,
}: {
  driver: Driver
  onClose: () => void
  onSaved: (share: { name: string; code: string; pin: string }) => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [newCode, setNewCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^[0-9]{4,8}$/.test(pin)) return setError('PIN mora imati od 4 do 8 cifara.')
    setBusy(true)
    setError(null)
    try {
      const res = await getApi().owner.setDriverPin(driver.id, pin, newCode)
      await onSaved({ name: driver.name, code: res.code, pin })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField
        label="Novi PIN (4 do 8 cifara)"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        hint="Stari PIN prestaje da važi, a eventualno zaključavanje se odmah skida."
      />
      <CheckField label="Napravi i novi kod" hint="Stari link prestaje da važi. Koristite ako je telefon izgubljen." checked={newCode} onChange={(e) => setNewCode(e.target.checked)} />
      <FormError text={error} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : 'Postavi PIN'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Otkaži
        </button>
      </div>
    </form>
  )
}

function ShareRow({ label, value, onCopy }: { label: string; value: string; onCopy: (label: string, value: string) => void }) {
  return (
    <div className="share-row">
      <div>
        <p className="label">{label}</p>
        <p className="share-value">{value}</p>
      </div>
      <button type="button" className="btn" onClick={() => onCopy(label, value)}>
        <Icon name="copy" size={18} /> Kopiraj
      </button>
    </div>
  )
}

function ShareBox({ code, pin, onClose }: { code: string; pin: string | null; onClose: () => void }) {
  const toast = useToast()

  async function copy(label: string, value: string) {
    const ok = await copyText(value)
    toast(ok ? `${label}: kopirano.` : 'Kopiranje nije uspelo. Označite tekst i kopirajte ga ručno.', ok ? 'ok' : 'error')
  }

  return (
    <div className="form">
      <p className="muted">
        Pošaljite vozaču <strong>link</strong> (u njemu je kod), a <strong>PIN poslednje i posebnom porukom</strong>.
      </p>
      <ShareRow label="Link" value={loginLink(code)} onCopy={copy} />
      <ShareRow label="Kod" value={formatCode(code)} onCopy={copy} />
      {pin ? (
        <>
          <ShareRow label="PIN" value={pin} onCopy={copy} />
          <p className="form-error" role="note">
            PIN se čuva samo kao šifrovan zapis i posle zatvaranja ovog prozora ne može ponovo da se vidi. Ako ga zaboravite, postavite novi.
          </p>
        </>
      ) : (
        <p className="hint">PIN se ne može ponovo videti. Ako ga je vozač zaboravio, izaberite „Novi PIN“.</p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Gotovo
        </button>
      </div>
    </div>
  )
}
