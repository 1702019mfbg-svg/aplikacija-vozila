import { useMemo, useState, type FormEvent } from 'react'
import { FormError, TextField } from '../components/Fields'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { Status } from '../components/Status'
import { useToast } from '../components/Toast'
import { errorText, getApi } from '../lib/api'
import { addDays, addMonths } from '../lib/dates'
import { formatDate, formatMeter, formatMonths, meterName, parseInteger, parseMeter, todayISO } from '../lib/format'
import {
  REMINDER_PRESETS, WARN_DAYS, WARN_METER, evaluateReminder, isIntervalReminder, nextDueDate, presetFor, sortByUrgency,
} from '../lib/reminders'
import { reminderTypesFor, type Section } from '../lib/sections'
import type { Reminder, ReminderInput, ReminderType, Vehicle } from '../lib/types'

interface Props {
  section: Section
  vehicle: Vehicle
  reminders: Reminder[]
  currentMeter: number
  onChanged: () => Promise<void>
}

export function Podsetnici({ section, vehicle, reminders, currentMeter, onChanged }: Props) {
  const unit = vehicle.meter_unit
  const [form, setForm] = useState<{ type: ReminderType; reminder: Reminder | null } | null>(null)
  const [done, setDone] = useState<Reminder | null>(null)

  const items = useMemo(
    () =>
      sortByUrgency(
        reminders
          .filter((r) => r.vehicle_id === vehicle.id)
          .map((r) => ({ r, state: evaluateReminder(r, currentMeter, new Date(), unit) })),
      ),
    [reminders, vehicle.id, currentMeter, unit],
  )

  const fixedTypes: ReminderType[] = ['tehnicki', 'registracija', 'tahograf']
  const present = new Set(items.map((i) => i.r.type))

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-title">Dodaj podsetnik</h2>
        <div className="chips">
          {reminderTypesFor(section).map((t) => {
            const exists = fixedTypes.includes(t) && present.has(t)
            const preset = presetFor(t)
            return (
              <button
                key={t}
                type="button"
                className="chip"
                disabled={exists}
                title={exists ? 'Već dodato za ovo vozilo' : preset.hint}
                onClick={() => setForm({ type: t, reminder: null })}
              >
                <Icon name="plus" size={16} /> {preset.label}
              </button>
            )
          })}
        </div>
        <p className="hint">
          Upozorenje se pojavljuje {WARN_DAYS} dana pre isteka roka. Za servis i kad do roka ostane {formatMeter(WARN_METER[unit], unit, true)}.
        </p>
      </section>

      {items.length === 0 ? (
        <div className="card empty">
          <p>Još nema podsetnika za ovo {section === 'masine' ? 'sredstvo' : 'vozilo'}. Dodajte prvi pomoću dugmadi iznad.</p>
        </div>
      ) : (
        <ul className="stack">
          {items.map(({ r, state }) => (
            <li key={r.id} className={`card reminder reminder--${state.status}`}>
              <div className="reminder-head">
                <h3>{r.title}</h3>
                <Status status={state.status} />
              </div>
              <p className="reminder-when">{state.parts.join(' · ')}</p>
              <p className="hint">{describeRule(r, unit)}</p>
              <div className="form-actions">
                <button type="button" className="btn btn--primary" onClick={() => setDone(r)}>
                  <Icon name="check" size={18} /> Urađeno
                </button>
                <button type="button" className="btn" onClick={() => setForm({ type: r.type, reminder: r })}>
                  <Icon name="edit" size={18} /> Izmeni
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <Modal title={form.reminder ? 'Izmena podsetnika' : `Novi podsetnik: ${presetFor(form.type).label}`} onClose={() => setForm(null)}>
          <ReminderForm
            vehicle={vehicle}
            type={form.type}
            initial={form.reminder}
            currentMeter={currentMeter}
            onClose={() => setForm(null)}
            onChanged={onChanged}
          />
        </Modal>
      )}

      {done && (
        <Modal title={`Urađeno: ${done.title}`} onClose={() => setDone(null)}>
          <DoneForm reminder={done} unit={unit} currentMeter={currentMeter} onClose={() => setDone(null)} onChanged={onChanged} />
        </Modal>
      )}
    </div>
  )
}

function describeRule(r: Reminder, unit: Vehicle['meter_unit']): string {
  if (isIntervalReminder(r)) {
    const every = [r.interval_meter !== null ? formatMeter(r.interval_meter, unit, true) : null, r.interval_months ? formatMonths(r.interval_months) : null]
      .filter(Boolean)
      .join(' ili ')
    const last = [r.last_date ? formatDate(r.last_date) : null, r.last_meter !== null ? formatMeter(r.last_meter, unit) : null].filter(Boolean).join(', ')
    return `Na svakih ${every}.${last ? ` Poslednji put: ${last}.` : ''}`
  }
  return r.interval_months ? `Obnavlja se na svakih ${formatMonths(r.interval_months)}.` : ''
}

const numText = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))

function ReminderForm({
  vehicle, type, initial, currentMeter, onClose, onChanged,
}: {
  vehicle: Vehicle
  type: ReminderType
  initial: Reminder | null
  currentMeter: number
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const unit = vehicle.meter_unit
  const preset = REMINDER_PRESETS.find((p) => p.type === type) ?? presetFor('ostalo')
  const interval = isIntervalReminder({ type })

  const [title, setTitle] = useState(initial?.title ?? preset.title)
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [renewMonths, setRenewMonths] = useState(numText(initial ? initial.interval_months : preset.interval_months))
  const [everyMeter, setEveryMeter] = useState(numText(initial?.interval_meter ?? null))
  const [everyMonths, setEveryMonths] = useState(numText(initial?.interval_months ?? null))
  const [lastDate, setLastDate] = useState(initial?.last_date ?? (initial ? '' : todayISO()))
  const [lastMeter, setLastMeter] = useState(numText(initial?.last_meter ?? (initial ? null : currentMeter)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Upišite naziv.'

    const months = (text: string, key: string): number | null => {
      if (text.trim() === '') return null
      const n = parseInteger(text)
      if (n === null || n < 1 || n > 600) {
        errs[key] = 'Upišite ceo broj meseci.'
        return null
      }
      return n
    }

    let input: ReminderInput
    if (interval) {
      const meterEvery = everyMeter.trim() === '' ? null : parseMeter(everyMeter, unit)
      if (everyMeter.trim() !== '' && (meterEvery === null || meterEvery <= 0)) errs.everyMeter = 'Upišite ispravan broj.'
      const monthsEvery = months(everyMonths, 'everyMonths')
      if (everyMeter.trim() === '' && everyMonths.trim() === '') errs.everyMeter = `Upišite na koliko ${unit === 'h' ? 'radnih sati' : 'km'} ili meseci se servis ponavlja.`
      let lastMeterValue: number | null = null
      if (lastMeter.trim() !== '') {
        lastMeterValue = parseMeter(lastMeter, unit)
        if (lastMeterValue === null || lastMeterValue < 0) errs.lastMeter = 'Upišite ispravan broj.'
      } else if (meterEvery !== null) errs.lastMeter = `Upišite ${meterName(unit).toLowerCase()} na poslednjem servisu.`
      if (monthsEvery !== null && !lastDate) errs.lastDate = 'Upišite datum poslednjeg servisa.'
      input = {
        vehicle_id: vehicle.id, type, title: title.trim(), due_date: null, interval_meter: meterEvery, interval_months: monthsEvery,
        last_date: lastDate || null, last_meter: lastMeterValue,
      }
    } else {
      if (!dueDate) errs.dueDate = 'Upišite datum isteka.'
      const renew = months(renewMonths, 'renewMonths')
      input = {
        vehicle_id: vehicle.id, type, title: title.trim(), due_date: dueDate || null, interval_meter: null, interval_months: renew,
        last_date: null, last_meter: null,
      }
    }

    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      await getApi().owner.saveReminder(input, initial?.id)
      await onChanged()
      toast('Podsetnik je sačuvan.')
      onClose()
    } catch (err) {
      setServerError(errorText(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial || !window.confirm('Obrisati ovaj podsetnik?')) return
    setBusy(true)
    try {
      await getApi().owner.deleteReminder(initial.id)
      await onChanged()
      toast('Podsetnik je obrisan.')
      onClose()
    } catch (err) {
      setServerError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField label="Naziv" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={80} />
      {interval ? (
        <>
          <div className="row2">
            <TextField
              label={`Svakih (${unit === 'h' ? 'radnih sati' : 'km'})`}
              inputMode="decimal"
              value={everyMeter}
              onChange={(e) => setEveryMeter(e.target.value)}
              error={errors.everyMeter}
              placeholder={unit === 'h' ? 'npr. 250' : 'npr. 15000'}
            />
            <TextField
              label="Ili svakih (meseci)"
              inputMode="numeric"
              value={everyMonths}
              onChange={(e) => setEveryMonths(e.target.value)}
              error={errors.everyMonths}
              placeholder="npr. 12"
            />
          </div>
          <p className="hint">Dovoljno je upisati jedno ili oba. Važi onaj rok koji prvi dođe.</p>
          <div className="row2">
            <TextField label="Poslednji servis: datum" type="date" value={lastDate} max={addDays(todayISO(), 1)} onChange={(e) => setLastDate(e.target.value)} error={errors.lastDate} />
            <TextField
              label={`Poslednji servis: ${meterName(unit).toLowerCase()}`}
              inputMode="decimal"
              value={lastMeter}
              onChange={(e) => setLastMeter(e.target.value)}
              error={errors.lastMeter}
              hint={`Trenutno: ${formatMeter(currentMeter, unit)}`}
            />
          </div>
        </>
      ) : (
        <>
          <TextField label="Datum isteka" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
          <TextField
            label="Obnavlja se na svakih (meseci)"
            inputMode="numeric"
            value={renewMonths}
            onChange={(e) => setRenewMonths(e.target.value)}
            error={errors.renewMonths}
            hint="Služi dugmetu „Urađeno“ da sam pomeri rok. Možete ga promeniti."
          />
        </>
      )}
      <FormError text={serverError} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : 'Sačuvaj'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Otkaži
        </button>
        {initial && (
          <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
            Obriši
          </button>
        )}
      </div>
    </form>
  )
}

function DoneForm({
  reminder, unit, currentMeter, onClose, onChanged,
}: {
  reminder: Reminder
  unit: Vehicle['meter_unit']
  currentMeter: number
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const interval = isIntervalReminder(reminder)
  const today = todayISO()
  const [newDue, setNewDue] = useState(interval ? '' : nextDueDate(reminder, today))
  const [lastDate, setLastDate] = useState(today)
  const [lastMeter, setLastMeter] = useState(numText(currentMeter))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { id, ...rest } = reminder
    let input: ReminderInput
    if (interval) {
      const meterValue = reminder.interval_meter !== null ? parseMeter(lastMeter, unit) : reminder.last_meter
      if (reminder.interval_meter !== null && (meterValue === null || meterValue < 0)) return setError('Upišite ispravan broj.')
      if (reminder.interval_months && !lastDate) return setError('Upišite datum.')
      input = { ...rest, last_date: reminder.interval_months ? lastDate : reminder.last_date, last_meter: meterValue }
    } else {
      if (!newDue) return setError('Upišite novi datum isteka.')
      input = { ...rest, due_date: newDue }
    }
    setBusy(true)
    try {
      await getApi().owner.saveReminder(input, id)
      await onChanged()
      toast('Rok je pomeren.')
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      {interval ? (
        <>
          {reminder.interval_months && <TextField label="Datum servisa" type="date" value={lastDate} max={addDays(today, 1)} onChange={(e) => setLastDate(e.target.value)} />}
          {reminder.interval_meter !== null && (
            <TextField
              label={`${meterName(unit)} na servisu`}
              inputMode="decimal"
              value={lastMeter}
              onChange={(e) => setLastMeter(e.target.value)}
              hint={`Sledeći servis: za ${formatMeter(reminder.interval_meter, unit)} od ovoga.`}
            />
          )}
        </>
      ) : (
        <>
          <TextField label="Novi datum isteka" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} min={addMonths(today, -1)} />
          <p className="hint">
            Predlog je {reminder.interval_months ? `rok od ${formatMonths(reminder.interval_months)}` : 'rok od 12 meseci'}. Datum možete promeniti.
          </p>
        </>
      )}
      <FormError text={error} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : 'Potvrdi'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Otkaži
        </button>
      </div>
    </form>
  )
}
