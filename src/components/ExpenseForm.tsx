import { useRef, useState, type FormEvent } from 'react'
import { errorText } from '../lib/api'
import { priceFor } from '../lib/calc'
import { addDays } from '../lib/dates'
import { formatDate, formatMeter, formatNumber, formatRSD, meterName, parseDecimal, parseMeter, todayISO } from '../lib/format'
import { nextDueDate } from '../lib/reminders'
import {
  NOTE_REQUIRED, categoryLabel, unitFor, type Category, type Expense, type FuelPrice, type FuelType, type MeterUnit, type Reminder,
} from '../lib/types'
import { CheckField, FormError, TextAreaField, TextField } from './Fields'

export interface ExpenseFormValue {
  expense_date: string
  category: Category
  amount: number | null
  odometer: number | null
  liters: number | null
  full_tank: boolean | null
  note: string | null
  /** vlasnik: podsetnik čiji rok treba pomeriti posle ovog unosa */
  renewReminderId: string | null
}

interface Props {
  mode: 'owner' | 'driver'
  vehicle: { fuel_type: FuelType; meter_unit: MeterUnit }
  /** poslednja poznata vrednost brojača (km ili sati) */
  lastOdometer: number
  initial?: Expense | null
  category?: Category
  /** vrste koje vlasnik može da izabere */
  categories: Category[]
  reminders?: Reminder[]
  /** vlasnik: cene goriva, da se pri unosu vidi i obračun iznosa */
  prices?: FuelPrice[]
  onSubmit: (value: ExpenseFormValue) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}

const toInput = (n: number): string => String(n).replace('.', ',')

export function ExpenseForm({
  mode, vehicle, lastOdometer, initial, category: presetCategory, categories, reminders = [], prices = [], onSubmit, onDelete, onCancel, submitLabel,
}: Props) {
  const unit = vehicle.meter_unit
  const fuelUnit = unitFor(vehicle.fuel_type)
  const electric = vehicle.fuel_type === 'Električno'
  const today = todayISO()

  const [category, setCategory] = useState<Category>(initial?.category ?? presetCategory ?? categories[0] ?? 'gorivo')
  const [date, setDate] = useState(initial?.expense_date ?? today)
  // obračunat iznos (iz cene goriva) nije upisan u bazu, pa se u obrascu tretira kao prazan
  const initialAmount = initial?.calc ? null : (initial?.amount ?? null)
  const [amount, setAmount] = useState(initialAmount !== null ? toInput(initialAmount) : '')
  const [meter, setMeter] = useState(initial?.odometer != null ? toInput(initial.odometer) : '')
  const [liters, setLiters] = useState(initial?.liters != null ? toInput(initial.liters) : '')
  const [full, setFull] = useState(initial?.full_tank ?? true)
  const [note, setNote] = useState(initial?.note ?? '')
  const [renew, setRenew] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const isFuel = category === 'gorivo'
  const noteRequired = NOTE_REQUIRED.includes(category)
  const renewReminder =
    mode === 'owner' && !initial && (category === 'tehnicki' || category === 'registracija')
      ? reminders.find((r) => r.type === category)
      : undefined

  const priceInfo = mode === 'owner' && isFuel ? priceFor(prices, vehicle.fuel_type, date) : null
  const litersNumber = isFuel ? parseDecimal(liters) : null
  const meterNumber = parseMeter(meter, unit)
  const belowLast = mode === 'owner' && !initial && meterNumber !== null && meterNumber < lastOdometer

  function validate(): { value?: ExpenseFormValue; errors: Record<string, string> } {
    const errs: Record<string, string> = {}

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = 'Izaberite datum.'
    else if (date > addDays(today, 1)) errs.date = 'Datum ne može biti u budućnosti.'
    else if (mode === 'driver' && date < addDays(today, -14)) errs.date = 'Datum mora biti u poslednjih 14 dana.'

    let amountValue: number | null = null
    if (amount.trim() !== '') {
      const n = parseDecimal(amount)
      if (n === null || n < 0 || n > 99_999_999) errs.amount = 'Upišite ispravan iznos, npr. 1.250,50.'
      else amountValue = Math.round(n * 100) / 100
    } else if (mode === 'owner' && !isFuel && !(initial && initialAmount === null)) {
      errs.amount = 'Upišite iznos.' // za gorivo nije obavezan: računa se po ceni goriva
    }

    let meterValue: number | null = null
    if (meter.trim() !== '') {
      const n = parseMeter(meter, unit)
      if (n === null || n < 0 || n > 5_000_000) {
        errs.meter = unit === 'km' ? 'Kilometraža mora biti ceo broj.' : 'Upišite radne sate, npr. 4321,5.'
      } else if (mode === 'driver' && n < lastOdometer) {
        errs.meter = `Ne može biti manje od poslednje upisane (${formatMeter(lastOdometer, unit)}).`
      } else meterValue = n
    } else if (isFuel && mode === 'driver') {
      errs.meter = unit === 'km' ? 'Upišite kilometražu.' : 'Upišite radne sate.'
    }

    let litersValue: number | null = null
    if (isFuel) {
      const n = parseDecimal(liters)
      if (n === null || n <= 0 || n > 2000) errs.liters = `Upišite količinu u ${fuelUnit}.`
      else litersValue = Math.round(n * 100) / 100
    }

    const noteValue = note.trim() || null
    if (noteRequired && !noteValue) errs.note = 'Upišite šta je u pitanju.'
    else if (noteValue && noteValue.length > 500) errs.note = 'Napomena je predugačka (najviše 500 znakova).'

    if (Object.keys(errs).length > 0) return { errors: errs }
    return {
      errors: errs,
      value: {
        expense_date: date,
        category,
        amount: amountValue,
        odometer: meterValue,
        liters: litersValue,
        full_tank: isFuel ? full : null,
        note: noteValue,
        renewReminderId: renewReminder && renew ? renewReminder.id : null,
      },
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const result = validate()
    setErrors(result.errors)
    if (!result.value) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      await onSubmit(result.value)
    } catch (err) {
      setServerError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!onDelete || !window.confirm('Obrisati ovaj unos?')) return
    setBusy(true)
    setServerError(null)
    try {
      await onDelete()
    } catch (err) {
      setServerError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate ref={formRef}>
      {mode === 'owner' && (
        <div className="field">
          <span className="label" id="cat-label">
            Vrsta troška
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="cat-label">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                className="chip"
                onClick={() => {
                  setCategory(c)
                  setErrors({})
                }}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row2">
        <TextField
          label="Datum"
          type="date"
          value={date}
          max={addDays(today, 1)}
          min={mode === 'driver' ? addDays(today, -14) : undefined}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />
        <TextField
          label="Iznos (RSD)"
          inputMode="decimal"
          autoComplete="off"
          placeholder={mode === 'driver' ? 'nije obavezno' : isFuel ? 'nije obavezno' : '0,00'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          hint={
            mode === 'driver'
              ? isFuel
                ? 'Nije obavezno, iznos obračunava vlasnik.'
                : 'Ako ne znate iznos, ostavite prazno.'
              : isFuel
                ? 'Nije obavezno.'
                : undefined
          }
        />
      </div>

      <TextField
        label={`${meterName(unit)} (${unit})`}
        inputMode={unit === 'km' ? 'numeric' : 'decimal'}
        autoComplete="off"
        placeholder={unit === 'km' ? 'npr. 123456' : 'npr. 4321,5'}
        value={meter}
        onChange={(e) => setMeter(e.target.value)}
        error={errors.meter}
        hint={
          belowLast
            ? `Manje je od poslednje upisane (${formatMeter(lastOdometer, unit)}). Proverite unos.`
            : `Poslednja upisana: ${formatMeter(lastOdometer, unit)}${isFuel && mode === 'owner' && meter.trim() === '' ? '. Bez ovoga se gorivo ne uračunava u potrošnju.' : ''}`
        }
      />

      {isFuel && (
        <>
          <TextField
            label={`Količina (${fuelUnit})`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="npr. 45,5"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            error={errors.liters}
          />
          <CheckField
            label={electric ? 'Puna baterija' : 'Pun rezervoar'}
            hint="Označite ako je napunjeno do vrha. Potrebno za tačan obračun potrošnje."
            checked={full}
            onChange={(e) => setFull(e.target.checked)}
          />
          {mode === 'owner' && (
            <div className="price-note" role="note">
              {priceInfo ? (
                <>
                  <p>
                    <strong>
                      Cena goriva: {formatNumber(priceInfo.price, 2)} RSD/{fuelUnit}
                    </strong>{' '}
                    <span className="muted">(važi od {formatDate(priceInfo.valid_from)})</span>
                  </p>
                  {amount.trim() !== '' ? (
                    <p className="muted">Iznos koji ste upisali ima prednost nad obračunom.</p>
                  ) : litersNumber !== null && litersNumber > 0 ? (
                    <p>
                      Iznos će biti obračunat: <strong>{formatRSD(Math.round(litersNumber * priceInfo.price * 100) / 100)}</strong> (
                      {formatNumber(litersNumber, 2)} {fuelUnit} × {formatNumber(priceInfo.price, 2)})
                    </p>
                  ) : (
                    <p className="muted">Upišite količinu i iznos će se obračunati po ovoj ceni.</p>
                  )}
                </>
              ) : (
                <p className="muted">
                  Nema upisane cene goriva za ovaj datum, pa iznos ostaje prazan dok je ne upišete (Pregled → Cena goriva).
                </p>
              )}
            </div>
          )}
        </>
      )}

      <TextAreaField
        label={noteRequired ? 'Šta je u pitanju?' : 'Napomena (nije obavezno)'}
        rows={2}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={errors.note}
      />

      {renewReminder && (
        <CheckField
          label={`Pomeri podsetnik „${renewReminder.title}“ na ${formatDate(nextDueDate(renewReminder, date))}`}
          checked={renew}
          onChange={(e) => setRenew(e.target.checked)}
        />
      )}

      {initial && (
        <p className="hint">
          {initial.driver_name ? `Uneo: ${initial.driver_name}. ` : ''}Uneto {formatDate(initial.created_at.slice(0, 10))}
        </p>
      )}

      <FormError text={serverError} />

      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : (submitLabel ?? 'Sačuvaj')}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Otkaži
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
            Obriši
          </button>
        )}
      </div>
    </form>
  )
}
