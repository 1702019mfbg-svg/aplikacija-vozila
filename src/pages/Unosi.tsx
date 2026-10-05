import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { PERIODS, filterByRange, periodRange, sumAmount, type Period } from '../lib/calc'
import { buildCsv, csvFilename, downloadCsv } from '../lib/csv'
import { MONTHS_LONG, formatDate, formatMeter, formatNumber, formatRSD, plural } from '../lib/format'
import { categoriesFor, sectionOf } from '../lib/sections'
import { CATEGORIES, categoryLabel, unitFor, type Category, type Expense, type Vehicle } from '../lib/types'

interface Props {
  vehicle: Vehicle
  expenses: Expense[]
  loading: boolean
  period: Period
  onPeriod: (p: Period) => void
  pendingOnly: boolean
  onPendingOnly: (v: boolean) => void
  onEdit: (e: Expense) => void
}

const PAGE = 100

function byNewest(a: Expense, b: Expense): number {
  return b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at)
}

export function Unosi({ vehicle, expenses, loading, period, onPeriod, pendingOnly, onPendingOnly, onEdit }: Props) {
  const [category, setCategory] = useState<'' | Category>('')
  const [limit, setLimit] = useState(PAGE)
  const unit = vehicle.meter_unit
  const fuelUnit = unitFor(vehicle.fuel_type)
  const categoryIds = categoriesFor(sectionOf(unit), CATEGORIES.map((c) => c.id))

  const shown = useMemo(() => {
    // "samo bez iznosa" prikazuje sve takve unose, bez obzira na period
    const inPeriod = pendingOnly ? expenses : filterByRange(expenses, periodRange(period))
    return inPeriod.filter((e) => (!category || e.category === category) && (!pendingOnly || e.amount === null)).sort(byNewest)
  }, [expenses, period, category, pendingOnly])

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of shown.slice(0, limit)) {
      const key = e.expense_date.slice(0, 7)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()].map(([key, items]) => {
      const [y, m] = key.split('-').map(Number)
      const name = MONTHS_LONG[m - 1]
      return { key, title: `${name[0].toUpperCase()}${name.slice(1)} ${y}.`, items, total: sumAmount(items) }
    })
  }, [shown, limit])

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="pills" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" aria-pressed={period === p.id && !pendingOnly} disabled={pendingOnly} onClick={() => onPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="toolbar-row">
          <select aria-label="Vrsta troška" value={category} onChange={(e) => setCategory(e.target.value as '' | Category)}>
            <option value="">Sve vrste</option>
            {categoryIds.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <label className="check check--inline">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => onPendingOnly(e.target.checked)} />
            <span>Samo bez iznosa</span>
          </label>
          <button
            type="button"
            className="btn"
            disabled={shown.length === 0}
            onClick={() => downloadCsv(csvFilename(vehicle), buildCsv(shown, vehicle))}
          >
            <Icon name="download" size={18} /> Izvezi CSV
          </button>
        </div>
      </div>

      {pendingOnly && <p className="hint">Prikazani su svi unosi bez iznosa, bez obzira na period. Kliknite na unos da upišete iznos.</p>}

      {loading && expenses.length === 0 ? (
        <p className="muted">Učitavanje…</p>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <p>{expenses.length === 0 ? 'Još nema unosa. Dodajte prvi trošak dugmetom „Novi trošak“.' : 'Nema unosa za izabrane filtere.'}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="group">
            <h2 className="group-title">
              <span>{g.title}</span>
              <span className="muted">{formatRSD(g.total, 0)}</span>
            </h2>
            <ul className="list card">
              {g.items.map((e) => (
                <li key={e.id}>
                  <button type="button" className="row" onClick={() => onEdit(e)}>
                    <span className="row-main">
                      <span className="row-title">
                        {categoryLabel(e.category)}
                        {e.note && <span className="muted"> · {e.note}</span>}
                      </span>
                      <span className="row-sub">
                        {[
                          formatDate(e.expense_date),
                          e.odometer !== null ? formatMeter(e.odometer, unit) : null,
                          e.liters !== null ? `${formatNumber(e.liters, 1)} ${fuelUnit}${e.full_tank ? ' (pun)' : ''}` : null,
                          e.driver_name ? `Uneo: ${e.driver_name}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {e.amount !== null ? (
                      <span className="row-amount">{formatNumber(e.amount, 2)}</span>
                    ) : (
                      <span className="badge badge--soon">bez iznosa</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {shown.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>
          Prikaži još ({shown.length - limit} {plural(shown.length - limit, 'unos', 'unosa', 'unosa')})
        </button>
      )}
    </div>
  )
}
