import { useState } from 'react'
import { ExpenseForm, type ExpenseFormValue } from '../components/ExpenseForm'
import { Icon } from '../components/Icon'
import { SectionSwitch } from '../components/SectionSwitch'
import { useIdleLogout } from '../hooks/useIdleLogout'
import { getApi, type DriverCreds } from '../lib/api'
import { formatDate, formatMeter, formatRSD, meterName } from '../lib/format'
import { SECTIONS, SECTION_COPY, categoriesFor, vehicleTitle, vehiclesIn, type Section } from '../lib/sections'
import { DRIVER_CATEGORIES, categoryLabel, unitFor, type Category, type DriverSession } from '../lib/types'
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

/**
 * Ekran vozača. Namerno nema listu ranijih unosa, zbirove ni iznose iz baze:
 * vozač ne može da pročita ništa, samo da upiše novi trošak.
 */
export function DriverApp({ creds, session, onLogout }: Props) {
  useIdleLogout(10, onLogout) // posle 10 minuta mirovanja traži PIN ponovo

  const available = SECTIONS.filter((s) => vehiclesIn(session.vehicles, s).length > 0)
  const [section, setSection] = useState<Section>(available[0] ?? 'vozila')
  const [chosen, setChosen] = useState<Partial<Record<Section, string>>>({})
  const [lastMeter, setLastMeter] = useState<Record<string, number>>(() => Object.fromEntries(session.vehicles.map((v) => [v.id, v.last_odometer])))
  const [step, setStep] = useState<Step>({ kind: 'home' })

  const inSection = vehiclesIn(session.vehicles, section)
  const vehicle = inSection.find((v) => v.id === chosen[section]) ?? inSection[0] ?? null
  const firstName = session.name.split(' ')[0]

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
          {session.vehicles.length > 0 && (
            <div className="header-controls">
              {available.length > 1 && (
                <SectionSwitch
                  section={section}
                  available={available}
                  onChange={(s) => {
                    setSection(s)
                    setStep({ kind: 'home' })
                  }}
                />
              )}
              {inSection.length > 1 && vehicle && (
                <select
                  className="header-select"
                  aria-label={SECTION_COPY[section].select}
                  value={vehicle.id}
                  onChange={(e) => {
                    setChosen({ ...chosen, [section]: e.target.value })
                    setStep({ kind: 'home' })
                  }}
                >
                  {inSection.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleTitle(v)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="main main--narrow">
        {!vehicle ? (
          <div className="card empty">
            <p>
              <strong>Nijedno vozilo vam nije dodeljeno.</strong>
            </p>
            <p className="muted">Javite se vlasniku da vam ga dodeli.</p>
          </div>
        ) : step.kind === 'home' ? (
          <div className="stack">
            <p className="driver-vehicle">
              <Icon name={vehicle.meter_unit === 'h' ? 'forklift' : 'car'} size={20} /> {vehicleTitle(vehicle)}
            </p>
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
            <p className="muted">{vehicleTitle(vehicle)}</p>
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
