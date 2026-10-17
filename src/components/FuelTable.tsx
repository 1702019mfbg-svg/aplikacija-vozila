import { useState } from 'react'
import type { FuelRow, FuelRowStatus } from '../lib/calc'
import { formatMeter, formatNumber, todayISO } from '../lib/format'
import { consumptionUnit } from '../lib/sections'
import type { MeterUnit } from '../lib/types'

interface Props {
  rows: FuelRow[]
  unit: MeterUnit
  fuelUnit: string
  /** prosečna potrošnja u periodu (L/100 km ili L/h), za označavanje većih odstupanja */
  average: number | null
}

const PAGE = 10
/** Sipanje sa ovoliko većom potrošnjom od proseka se označava. */
const HIGH = 1.15

/** Broj bez jedinice (jedinica je u zaglavlju): celi brojevi bez decimala, ostali sa jednom. */
const plain = (n: number): string => formatNumber(n, Number.isInteger(n) ? 0 : 1)

/** Kratak datum: "11.10.", a za ranije godine "11.10.25." */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y === todayISO().slice(0, 4) ? `${d}.${m}.` : `${d}.${m}.${y.slice(2)}.`
}

/** Potrošnja posle svakog sipanja: pređeno od prethodnog punog sipanja, litri i potrošnja za taj razmak. */
export function FuelTable({ rows, unit, fuelUnit, average }: Props) {
  const [limit, setLimit] = useState(PAGE)
  const machine = unit === 'h'
  const value = (r: FuelRow): number => (machine ? (r.perUnit as number) : (r.per100 as number))
  const okCount = rows.filter((r) => r.status === 'ok').length
  // sa samo jednim ili dva sipanja prosek je skoro isto što i ta sipanja, pa se ništa ne označava
  const isHigh = (r: FuelRow): boolean => r.status === 'ok' && average !== null && okCount >= 3 && value(r) > average * HIGH

  const notes: Record<Exclude<FuelRowStatus, 'ok'>, string> = {
    partial: 'delimično',
    first: 'početak',
    no_meter: machine ? 'nema sati' : 'nema km',
    bad_meter: machine ? 'proveri sate' : 'proveri km',
  }

  if (rows.length === 0) return <p className="muted">Nema sipanja u izabranom periodu.</p>

  return (
    <>
      <div className="fuel-table-wrap">
        <table className="fuel-table">
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col" className="num">
                {machine ? 'Sati' : 'Pređeno'}
              </th>
              <th scope="col" className="num">
                Litara
              </th>
              <th scope="col" className="num">
                {consumptionUnit(unit, fuelUnit)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const high = isHigh(r)
              const e = r.expense
              return (
                <tr key={e.id} className={high ? 'fuel-high' : undefined}>
                  <td>
                    {shortDate(e.expense_date)}
                    <small>{e.odometer !== null ? formatMeter(e.odometer, unit, true) : '—'}</small>
                  </td>
                  <td className="num">{r.distance !== null ? (machine ? plain(r.distance) : formatNumber(r.distance, 0)) : '—'}</td>
                  <td className="num">
                    {plain(r.liters ?? (e.liters as number))}
                    {r.partials > 0 && <small>+{r.partials} delim.</small>}
                    {!e.full_tank && r.status !== 'no_meter' && <small>nije pun</small>}
                  </td>
                  <td className="num">
                    {r.status === 'ok' ? (
                      <>
                        <strong>
                          {formatNumber(value(r), machine ? 2 : 1)}
                          {high && <span aria-label="iznad proseka"> ▲</span>}
                        </strong>
                        {r.costPerUnit !== null && (
                          <small>
                            {formatNumber(r.costPerUnit, 1)} RSD/{unit}
                          </small>
                        )}
                      </>
                    ) : (
                      <small>{notes[r.status]}</small>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit(rows.length)}>
          Prikaži sva sipanja ({rows.length})
        </button>
      )}
      <p className="hint">
        Potrošnja se računa posle svakog <strong>punog</strong> sipanja: litri od prethodnog punog (zajedno sa delimičnim između) podeljeni sa
        pređenim {machine ? 'radnim satima' : 'kilometrima'}. Ispod je cena goriva po {machine ? 'satu' : 'km'}.
        {okCount >= 3 && ' ▲ označava potrošnju bar 15% veću od proseka.'}
      </p>
    </>
  )
}
