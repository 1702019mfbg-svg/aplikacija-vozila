import { useState } from 'react'
import { ExpenseForm, type ExpenseFormValue } from '../components/ExpenseForm'
import { Icon } from '../components/Icon'
import { useIdleLogout } from '../hooks/useIdleLogout'
import { getApi, type DriverCreds } from '../lib/api'
import { formatDate, formatMeter, formatRSD, meterName } from '../lib/format'
import { SECTIONS, SECTION_COPY, categoriesFor, sectionOf, vehicleTitle, vehiclesIn } from '../lib/sections'
import { DRIVER_CATEGORIES, categoryLabel, unitFor, type Category, type DriverSession, type DriverVehicle } from '../lib/types'
import { newId } from '../lib/uuid'

interface Props {
  creds: DriverCreds
  session: DriverSession
  onLogout: () => void
}

type Step =
  | { kind: 'home' }
  | { kind: 'form'; category: Category; id: string }
  | { kind: 'done'; lines: [string, string][] }

const vehicleIcon = (v: DriverVehicle) => (v.meter_unit === 'h' ? 'forklift' : 'car')

/**
 * Ekran vozača. Prvo se bira vozilo (da se ne pogreši), pa tek onda vrsta troška.
 * Namerno nema listu ranijih unosa, zbirove, iznose ni cene iz baze:
 * vozač ne može da pročita ništa, samo da upiše novi trošak.
 */
export function DriverApp({ creds, session, onLogout }: Props) {
  useIdleLogout(10, onLogout) // posle 10 minuta mirovanja traži PIN ponovo

  const vehicles = session.vehicles
  const several = vehicles.length > 1
  // Ko ima samo jedno vozilo, ne bira ništa (ne može da pogreši). Inače se mora izabrati posle svake prijave.
  const [vehicleId, setVehicleId] = useState<string | null>(vehicles.length === 1 ? vehicles[0].id : null)
  const [lastMeter, setLastMeter] = useState<Record<string, number>>(() => Object.fromEntries(vehicles.map((v) => [v.id, v.last_odometer])))
  const [step, setStep] = useState<Step>({ kind: 'home' })

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const section = vehicle ? sectionOf(vehicle.meter_unit) : 'vozila'
  const firstName = session.name.split(' ')[0]

  const pick = (id: string) => {
    setVehicleId(id)
    setStep({ kind: 'home' })
  }
  const changeVehicle = () => {
    setVehicleId(null)
    setStep({ kind: 'home' })
  }

  async function save(category: Category, id: string, v: ExpenseFormValue) {
    if (!vehicle) return
    await getApi().driver.addExpense(creds, {
      id,
      vehicle_id: vehicle.id,
      expense_date: v.expense_date,
      category,
      amount: v.amount,
      odometer: v.odometer,
      liters: v.liters,
      full_tank: v.full_tank ?? false,
      note: v.note,
    })
    if (v.odometer !== null) setLastMeter((m) => ({ ...m, [vehicle.id]: Math.max(m[vehicle.id] ?? 0, v.odometer as number) }))
    const fuelUnit = unitFor(vehicle.fuel_type)
    const lines: [string, string][] = [
      ['Vozilo', vehicleTitle(vehicle)],
      ['Vrsta', categoryLabel(category)],
      ['Datum', formatDate(v.expense_date)],
    ]
    if (v.odometer !== null) lines.push([meterName(vehicle.meter_unit), formatMeter(v.odometer, vehicle.meter_unit)])
    if (v.liters !== null) lines.push(['Količina', `${String(v.liters).replace('.', ',')} ${fuelUnit}${v.full_tank ? ' (pun)' : ''}`])
    if (v.amount !== null) lines.push(['Iznos', formatRSD(v.amount)])
    if (v.note) lines.push(['Napomena', v.note])
    setStep({ kind: 'done', lines })
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-top">
            <h1 className="brand">Zdravo, {firstName}</h1>
            <button type="button" className="btn btn--header" onClick={onLogout}>
              <Icon name="logout" size={18} /> Odjava
            </button>
          </div>
        </div>
      </header>

      <main className="main main--narrow">
        {vehicles.length === 0 ? (
          <div className="card empty">
            <p>
              <strong>Nijedno vozilo vam nije dodeljeno.</strong>
            </p>
            <p className="muted">Javite se vlasniku da vam ga dodeli.</p>
          </div>
        ) : !vehicle ? (
          /* 1. korak: izbor vozila */
          <div className="stack">
            <h2 className="driver-question">Izaberite vozilo</h2>
            <p className="muted">Dodirnite vozilo ili mašinu za koju upisujete trošak.</p>
            {SECTIONS.map((s) => {
              const list = vehiclesIn(vehicles, s)
              if (list.length === 0) return null
              return (
                <section key={s} className="pick-group" aria-label={SECTION_COPY[s].label}>
                  {SECTIONS.every((x) => vehiclesIn(vehicles, x).length > 0) && <h3 className="pick-title">{SECTION_COPY[s].label}</h3>}
                  <ul className="picks">
                    {list.map((v) => (
                      <li key={v.id}>
                        <button type="button" className="pick" onClick={() => pick(v.id)}>
                          <span className="pick-icon">
                            <Icon name={vehicleIcon(v)} size={26} />
                          </span>
                          <span className="pick-text">
                            <strong>{v.name}</strong>
                            {v.plate && <small>{v.plate}</small>}
                          </span>
                          <Icon name="chevron" size={22} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : step.kind === 'home' ? (
          /* 2. korak: vrsta troška za izabrano vozilo */
          <div className="stack">
            <div className="vehicle-bar">
              <span className="pick-icon">
                <Icon name={vehicleIcon(vehicle)} size={26} />
              </span>
              <span className="pick-text">
                <small>Upisujete za</small>
                <strong>{vehicle.name}</strong>
                {vehicle.plate && <small>{vehicle.plate}</small>}
              </span>
              {several && (
                <button type="button" className="btn" onClick={changeVehicle}>
                  Promeni
                </button>
              )}
            </div>
            <h2 className="driver-question">Šta želite da upišete?</h2>
            <div className="tiles">
              {categoriesFor(section, DRIVER_CATEGORIES).map((c) => (
                <button key={c} type="button" className="tile" onClick={() => setStep({ kind: 'form', category: c, id: newId() })}>
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          </div>
        ) : step.kind === 'form' ? (
          <div className="card">
            <div className="form-title">
              <button type="button" className="btn btn--ghost" onClick={() => setStep({ kind: 'home' })}>
                ← Nazad
              </button>
              <h2>{categoryLabel(step.category)}</h2>
            </div>
            <p className="driver-vehicle">
              <Icon name={vehicleIcon(vehicle)} size={20} /> {vehicleTitle(vehicle)}
            </p>
            <ExpenseForm
              mode="driver"
              vehicle={vehicle}
              lastOdometer={lastMeter[vehicle.id] ?? vehicle.last_odometer}
              category={step.category}
              categories={[step.category]}
              onSubmit={(v) => save(step.category, step.id, v)}
              onCancel={() => setStep({ kind: 'home' })}
              submitLabel="Sačuvaj unos"
            />
          </div>
        ) : (
          <div className="card done">
            <div className="done-icon">
              <Icon name="check" size={36} />
            </div>
            <h2>Unos je sačuvan</h2>
            <dl className="facts facts--stack">
              {step.lines.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="form-actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep({ kind: 'home' })}>
                Novi unos
              </button>
              {several && (
                <button type="button" className="btn" onClick={changeVehicle}>
                  Drugo vozilo
                </button>
              )}
              <button type="button" className="btn" onClick={onLogout}>
                Gotovo, odjavi me
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
