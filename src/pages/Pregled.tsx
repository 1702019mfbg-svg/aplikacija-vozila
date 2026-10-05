import { useMemo } from 'react'
import { CategoryBars, MonthlyChart } from '../components/Charts'
import { Icon } from '../components/Icon'
import { Odometar } from '../components/Odometar'
import { Status } from '../components/Status'
import { PERIODS, byCategory, monthlySeries, summarize, type Period } from '../lib/calc'
import { formatMeter, formatMonths, formatNumber, formatRSD, plural } from '../lib/format'
import type { Alert } from '../lib/reminders'
import { SECTION_COPY, consumptionUnit, sectionOf, vehicleTitle } from '../lib/sections'
import { unitFor, type Expense, type Vehicle } from '../lib/types'

interface Props {
  vehicle: Vehicle
  expenses: Expense[]
  loading: boolean
  /** upozorenja za ovaj deo aplikacije (vozila ili mašine) */
  alerts: Alert[]
  showVehicleInAlerts: boolean
  period: Period
  onPeriod: (p: Period) => void
  includeAmort: boolean
  onIncludeAmort: (v: boolean) => void
  onOpenAlert: (vehicleId: string) => void
  onOpenPending: () => void
  onEditVehicle: () => void
}

export function Pregled({
  vehicle, expenses, loading, alerts, showVehicleInAlerts, period, onPeriod, includeAmort, onIncludeAmort, onOpenAlert, onOpenPending, onEditVehicle,
}: Props) {
  const unit = vehicle.meter_unit
  const copy = SECTION_COPY[sectionOf(unit)]
  const fuelUnit = unitFor(vehicle.fuel_type)

  const summary = useMemo(() => summarize(vehicle, expenses, period, { includeAmort }), [vehicle, expenses, period, includeAmort])
  const series = useMemo(() => monthlySeries(expenses), [expenses])
  const categories = useMemo(() => byCategory(summary.list), [summary.list])
  const pendingAll = useMemo(() => expenses.filter((e) => e.amount === null).length, [expenses])
  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase()

  const costText = summary.costPerUnit !== null ? formatNumber(summary.costPerUnit, 2) : '––,––'
  const fuel = summary.fuel

  return (
    <div className="stack">
      {alerts.length > 0 && (
        <section className="card alerts" aria-label="Upozorenja">
          <h2 className="card-title">Upozorenja</h2>
          <ul>
            {alerts.slice(0, 6).map((a) => (
              <li key={a.reminder.id}>
                <button type="button" className={`alert alert--${a.state.status}`} onClick={() => onOpenAlert(a.vehicle.id)}>
                  <Status status={a.state.status} />
                  <span className="alert-text">
                    <span>
                      <strong>{a.reminder.title}</strong>
                      {showVehicleInAlerts && <span className="muted">{`  ${vehicleTitle(a.vehicle)}`}</span>}
                    </span>
                    <span className="alert-when">{a.state.parts.join(' · ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {alerts.length > 6 && <p className="hint">I još {alerts.length - 6}. Pogledajte karticu Podsetnici.</p>}
        </section>
      )}

      {pendingAll > 0 && (
        <button type="button" className="banner" onClick={onOpenPending}>
          <Icon name="warn" size={18} />
          <span>
            {pendingAll} {plural(pendingAll, 'unos čeka', 'unosa čekaju', 'unosa čeka')} iznos
          </span>
          <span className="banner-action">Dopuni</span>
        </button>
      )}

      <div className="pills" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => onPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <section className="hero" aria-label={copy.costTitle}>
        <p className="hero-label">{copy.costTitle}</p>
        <div className="hero-figure">
          <Odometar text={costText} label={summary.costPerUnit !== null ? `${costText} ${copy.costUnit}` : 'Nema podataka'} />
          <span className="hero-unit">{copy.costUnit}</span>
        </div>
        {summary.costPerUnit === null && !loading && <p className="hero-hint">{copy.usageHint}</p>}
        {summary.amort ? (
          <label className="hero-toggle">
            <input type="checkbox" checked={includeAmort} onChange={(e) => onIncludeAmort(e.target.checked)} />
            <span>
              Uračunaj amortizaciju
              <small>
                {formatRSD(summary.amort.amount, 0)} u periodu · {formatRSD(summary.amort.perMonth, 0)} mesečno ({summary.amort.years}{' '}
                {plural(summary.amort.years, 'godina', 'godine', 'godina')})
              </small>
            </span>
          </label>
        ) : (
          <button type="button" className="hero-link" onClick={onEditVehicle}>
            Dodajte nabavnu cenu da se uračuna amortizacija
          </button>
        )}
      </section>

      <div className="kpis">
        <div className="kpi">
          <p className="kpi-label">Ukupno{includeAmort && summary.amort ? ' sa amortizacijom' : ''}</p>
          <p className="kpi-value">{formatRSD(summary.total, 0)}</p>
          <p className="kpi-sub">
            {summary.count} {plural(summary.count, 'unos', 'unosa', 'unosa')} · {periodLabel}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">{copy.usageTitle}</p>
          <p className="kpi-value">{summary.usage !== null ? formatMeter(summary.usage, unit) : '—'}</p>
          <p className="kpi-sub">
            {summary.usagePerMonth !== null ? `≈ ${formatMeter(summary.usagePerMonth, unit)} mesečno` : 'Potrebna su 2 unosa sa očitavanjem'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">
            {copy.consumptionTitle} ({consumptionUnit(unit, fuelUnit)})
          </p>
          <p className="kpi-value">{fuel ? formatNumber(unit === 'h' ? fuel.perUnit : fuel.per100, unit === 'h' ? 2 : 1) : '—'}</p>
          <p className="kpi-sub">
            {fuel ? `${formatNumber(fuel.liters, 0)} ${fuelUnit} na ${formatMeter(fuel.usage, unit)}` : 'Potrebna su 2 puna sipanja'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Mesečni prosek</p>
          <p className="kpi-value">{formatRSD(summary.monthlyAvg, 0)}</p>
          <p className="kpi-sub">za {formatMonths(summary.months)}</p>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">Troškovi po mesecima</h2>
        <p className="card-sub">Poslednjih 12 meseci, u RSD</p>
        <MonthlyChart points={series} />
      </section>

      <section className="card">
        <h2 className="card-title">Raspodela po vrstama troška</h2>
        <p className="card-sub">Izabrani period: {periodLabel}</p>
        <CategoryBars items={categories} />
      </section>
    </div>
  )
}
