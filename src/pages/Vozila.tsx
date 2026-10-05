import { useState, type FormEvent } from 'react'
import { FormError, SelectField, TextField } from '../components/Fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { errorText, getApi, type VehicleInput } from '../lib/api'
import { formatDate, formatMeter, formatRSD, meterName, parseDecimal, parseInteger, parseMeter, todayISO } from '../lib/format'
import { SECTION_COPY, unitOfSection, type Section } from '../lib/sections'
import { FUEL_TYPES, type FuelType, type Vehicle } from '../lib/types'

interface ListProps {
  section: Section
  vehicles: Vehicle[] // samo iz ovog dela
  odometers: Record<string, number>
  onAdd: () => void
  onEdit: (v: Vehicle) => void
}

export function Vozila({ section, vehicles, odometers, onAdd, onEdit }: ListProps) {
  const copy = SECTION_COPY[section]
  return (
    <div className="stack">
      <div className="page-actions">
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <Icon name="plus" size={18} /> {copy.add}
        </button>
      </div>
      {vehicles.length === 0 ? (
        <div className="card empty">
          <p>
            <strong>{copy.empty}</strong>
          </p>
          <p className="muted">{copy.emptyHint}</p>
        </div>
      ) : (
        <ul className="stack">
          {vehicles.map((v) => (
            <li key={v.id} className="card vehicle">
              <div className="vehicle-head">
                <div>
                  <h3>{v.name}</h3>
                  <p className="muted">{[v.plate, v.fuel_type].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" className="btn" onClick={() => onEdit(v)}>
                  <Icon name="edit" size={18} /> Izmeni
                </button>
              </div>
              <dl className="facts">
                <div>
                  <dt>{meterName(v.meter_unit)}</dt>
                  <dd>{formatMeter(odometers[v.id] ?? v.initial_odometer, v.meter_unit)}</dd>
                </div>
                {v.purchase_price !== null && v.purchase_date && (
                  <div>
                    <dt>Nabavka</dt>
                    <dd>
                      {formatRSD(v.purchase_price, 0)} · {formatDate(v.purchase_date)}
                    </dd>
                  </div>
                )}
                {v.amort_years && (
                  <div>
                    <dt>Amortizacija</dt>
                    <dd>{v.amort_years} god.</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const text = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','))

interface FormProps {
  section: Section
  initial: Vehicle | null
  onSaved: (v: Vehicle) => Promise<void>
  onDeleted: (id: string) => Promise<void>
  onClose: () => void
}

export function VehicleForm({ section, initial, onSaved, onDeleted, onClose }: FormProps) {
  const toast = useToast()
  const copy = SECTION_COPY[section]
  const unit = initial?.meter_unit ?? unitOfSection(section)

  const [name, setName] = useState(initial?.name ?? '')
  const [plate, setPlate] = useState(initial?.plate ?? '')
  const [fuel, setFuel] = useState<FuelType>(initial?.fuel_type ?? 'Dizel')
  const [initialMeter, setInitialMeter] = useState(initial ? text(initial.initial_odometer) : '0')
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? '')
  const [price, setPrice] = useState(text(initial?.purchase_price ?? null))
  const [years, setYears] = useState(text(initial?.amort_years ?? null))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Upišite naziv.'

    const meter = parseMeter(initialMeter, unit)
    if (meter === null || meter < 0 || meter > 5_000_000) {
      errs.initialMeter = unit === 'km' ? 'Upišite ceo broj kilometara.' : 'Upišite radne sate, npr. 4321,5.'
    }

    const anyPurchase = purchaseDate !== '' || price.trim() !== '' || years.trim() !== ''
    let priceValue: number | null = null
    let yearsValue: number | null = null
    if (anyPurchase) {
      priceValue = parseDecimal(price)
      if (priceValue === null || priceValue < 0) errs.price = 'Upišite nabavnu cenu.'
      if (!purchaseDate) errs.purchaseDate = 'Upišite datum kupovine.'
      yearsValue = parseInteger(years)
      if (yearsValue === null || yearsValue < 1 || yearsValue > 50) errs.years = 'Upišite broj godina (1 do 50).'
    }

    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const input: VehicleInput = {
      name: name.trim(),
      plate: plate.trim() || null,
      fuel_type: fuel,
      meter_unit: unit,
      initial_odometer: meter as number,
      purchase_date: anyPurchase ? purchaseDate : null,
      purchase_price: anyPurchase ? priceValue : null,
      amort_years: anyPurchase ? yearsValue : null,
    }
    setBusy(true)
    try {
      const saved = await getApi().owner.saveVehicle(input, initial?.id)
      await onSaved(saved)
      toast(initial ? 'Izmene su sačuvane.' : copy.added)
      onClose()
    } catch (err) {
      setServerError(errorText(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!initial || !window.confirm(copy.deleteWarning)) return
    setBusy(true)
    try {
      await getApi().owner.deleteVehicle(initial.id)
      await onDeleted(initial.id)
      toast('Obrisano.')
      onClose()
    } catch (err) {
      setServerError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField label="Naziv" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} placeholder={copy.namePlaceholder} />
      <TextField label={`${copy.plateLabel} (nije obavezno)`} value={plate} onChange={(e) => setPlate(e.target.value)} maxLength={20} />
      <div className="row2">
        <SelectField label="Vrsta goriva" value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)}>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </SelectField>
        <TextField
          label={copy.initialMeter + ` (${unit})`}
          inputMode={unit === 'km' ? 'numeric' : 'decimal'}
          value={initialMeter}
          onChange={(e) => setInitialMeter(e.target.value)}
          error={errors.initialMeter}
        />
      </div>

      <fieldset className="fieldset">
        <legend>Amortizacija (nije obavezno)</legend>
        <p className="hint">
          Nabavna cena se ravnomerno raspoređuje po danima na izabrani broj godina i prikazuje posebno na pregledu. Popunite sva tri polja ili nijedno.
        </p>
        <div className="row2">
          <TextField label="Datum kupovine" type="date" value={purchaseDate} max={todayISO()} onChange={(e) => setPurchaseDate(e.target.value)} error={errors.purchaseDate} />
          <TextField label="Nabavna cena (RSD)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} />
        </div>
        <TextField label="Očekivani broj godina korišćenja" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} error={errors.years} placeholder="npr. 8" />
      </fieldset>

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
