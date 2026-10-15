import { useMemo, useState, type FormEvent } from 'react'
import { FormError, TextField } from '../components/Fields'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { errorText, getApi } from '../lib/api'
import { priceFor } from '../lib/calc'
import { startOfWeek } from '../lib/dates'
import { formatDate, formatNumber, parseDecimal, todayISO } from '../lib/format'
import { FUEL_TYPES, unitFor, type FuelPrice, type FuelType } from '../lib/types'

interface Props {
  prices: FuelPrice[]
  /** vrste goriva koje se koriste (iz vozila i mašina) */
  fuels: FuelType[]
  initialFuel: FuelType
  onChanged: () => Promise<void>
  onClose: () => void
}

/**
 * Cena goriva: vlasnik upisuje novu cenu (npr. svake nedelje). Sipanja bez upisanog iznosa se
 * obračunavaju po ceni koja je važila na dan sipanja, pa se promena cene odmah vidi svuda.
 */
export function CeneGoriva({ prices, fuels, initialFuel, onChanged, onClose }: Props) {
  const toast = useToast()
  const options = FUEL_TYPES.filter((f) => fuels.includes(f) || f === initialFuel)
  const [fuel, setFuel] = useState<FuelType>(initialFuel)
  const [validFrom, setValidFrom] = useState(startOfWeek(todayISO())) // nedelja počinje ponedeljkom
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ price?: string; date?: string }>({})
  const [busy, setBusy] = useState(false)

  const unit = unitFor(fuel)
  const currentId = priceFor(prices, fuel, todayISO())?.id // cena koja važi danas (buduće cene još ne važe)
  const history = useMemo(
    () => prices.filter((p) => p.fuel_type === fuel).sort((a, b) => b.valid_from.localeCompare(a.valid_from)),
    [prices, fuel],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const errs: { price?: string; date?: string } = {}
    const n = parseDecimal(price)
    if (n === null || n <= 0 || n >= 100000) errs.price = `Upišite cenu po ${unit === 'L' ? 'litru' : 'kWh'}, npr. 194,50.`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) errs.date = 'Izaberite datum.'
    setFieldError(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      await getApi().owner.setFuelPrice(fuel, validFrom, n as number)
      await onChanged()
      toast('Cena je sačuvana. Sipanja bez iznosa su preračunata.')
      setPrice('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: FuelPrice) {
    if (!window.confirm(`Obrisati cenu od ${formatDate(p.valid_from)}? Sipanja će se računati po prethodnoj ceni.`)) return
    try {
      await getApi().owner.deleteFuelPrice(p.id)
      await onChanged()
      toast('Cena je obrisana.')
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="form">
      <p className="muted">
        Upišite cenu goriva (npr. svake nedelje). Svako sipanje <strong>bez upisanog iznosa</strong> računa se kao litri × cena koja je važila na dan sipanja.
        Iznos koji ste sami upisali uvek ima prednost.
      </p>

      {options.length > 1 && (
        <div className="field">
          <span className="label" id="fuel-label">
            Vrsta goriva
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="fuel-label">
            {options.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={fuel === f} className="chip" onClick={() => setFuel(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="form" onSubmit={submit} noValidate>
        <div className="row2">
          <TextField
            label={`Cena po ${unit === 'L' ? 'litru' : 'kWh'} (RSD)`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="npr. 194,50"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={fieldError.price}
          />
          <TextField
            label="Važi od"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            error={fieldError.date}
            hint="Podrazumevano ponedeljak ove nedelje."
          />
        </div>
        <FormError text={error} />
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Čuvam…' : 'Sačuvaj cenu'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Zatvori
          </button>
        </div>
      </form>

      <section aria-label={`Istorija cena: ${fuel}`}>
        <h3 className="price-history-title">Istorija cena: {fuel}</h3>
        {history.length === 0 ? (
          <p className="muted">Još nema upisane cene za {fuel.toLowerCase()}.</p>
        ) : (
          <ul className="list card">
            {history.map((p) => (
              <li key={p.id} className="price-row">
                <span>
                  <strong>{formatNumber(p.price, 2)} RSD</strong>/{unit}
                  {p.id === currentId && <span className="badge badge--ok price-current">važi sada</span>}
                </span>
                <span className="muted">od {formatDate(p.valid_from)}</span>
                <button type="button" className="icon-btn" aria-label={`Obriši cenu od ${formatDate(p.valid_from)}`} onClick={() => remove(p)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
