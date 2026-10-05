import { useState } from 'react'
import { useWidth } from '../hooks/useWidth'
import type { CategoryShare, MonthPoint } from '../lib/calc'
import { formatNumber, MONTHS_LONG } from '../lib/format'
import { categoryLabel } from '../lib/types'

const GAP = 2 // razmak između delova stuba, u boji podloge
const RADIUS = 4 // zaobljen samo vrh stuba; dno je ravno

/** Lepe okrugle vrednosti za osu: 0, 2.000, 4.000... */
export function niceScale(max: number): { yMax: number; ticks: number[] } {
  if (max <= 0) return { yMax: 4, ticks: [0, 1, 2, 3, 4] }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  const yMax = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { yMax, ticks }
}

/** Pravougaonik sa zaobljenim gornjim ćoškovima (dno ostaje ravno). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, h, w / 2))
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <i style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

const FUEL = { color: 'var(--series-1)', label: 'Gorivo' }
const OTHER = { color: 'var(--series-2)', label: 'Ostali troškovi' }

export function MonthlyChart({ points }: { points: MonthPoint[] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(320)
  const [active, setActive] = useState<number | null>(null)

  const total = points.reduce((s, p) => s + p.total, 0)
  if (total === 0) {
    return <p className="muted">Još nema unosa sa iznosom u poslednjih 12 meseci.</p>
  }

  const H = 240
  const maxVal = Math.max(...points.map((p) => p.total))
  const { yMax, ticks } = niceScale(maxVal)
  const labelChars = Math.max(...ticks.map((t) => formatNumber(t, 0).length))
  const M = { top: 24, right: 8, bottom: 40, left: Math.max(34, labelChars * 6.6 + 14) }
  const plotW = Math.max(120, width - M.left - M.right)
  const plotH = H - M.top - M.bottom
  const band = plotW / points.length
  const barW = Math.min(24, Math.max(6, band * 0.62))
  const baseY = M.top + plotH
  const y = (v: number) => baseY - (v / yMax) * plotH
  const labelEvery = band < 30 ? 2 : 1
  const maxIdx = points.findIndex((p) => p.total === maxVal)

  const tip = active !== null ? points[active] : null
  const tipX = active !== null ? Math.min(Math.max(M.left + band * (active + 0.5), 84), width - 84) : 0

  return (
    <div className="chart" ref={wrapRef}>
      <Legend items={[FUEL, OTHER]} />
      <div className="chart-area" onMouseLeave={() => setActive(null)}>
        <svg width={width} height={H} role="group" aria-label="Troškovi po mesecima, poslednjih 12 meseci">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
                {formatNumber(t, 0)}
              </text>
            </g>
          ))}

          {points.map((p, i) => {
            const cx = M.left + band * (i + 0.5)
            const x = cx - barW / 2
            const hFuel = (p.fuel / yMax) * plotH
            const hOther = (p.other / yMax) * plotH
            const showYear = i === 0 || p.month === 1
            return (
              <g key={p.key}>
                {active === i && <rect x={M.left + band * i} y={M.top - 6} width={band} height={plotH + 6} fill="var(--surface-2)" />}
                {p.fuel > 0 &&
                  (p.other > 0 ? (
                    <rect x={x} y={baseY - hFuel} width={barW} height={hFuel} fill="var(--series-1)" />
                  ) : (
                    <path d={topRounded(x, baseY - hFuel, barW, hFuel, RADIUS)} fill="var(--series-1)" />
                  ))}
                {p.other > 0 && (
                  <path
                    d={topRounded(x, baseY - hFuel - hOther, barW, Math.max(hOther - (p.fuel > 0 ? GAP : 0), 1), RADIUS)}
                    fill="var(--series-2)"
                  />
                )}
                {(i % labelEvery === 0 || i === points.length - 1) && (
                  <text x={cx} y={baseY + 16} textAnchor="middle" className="chart-tick">
                    {p.label}
                  </text>
                )}
                {showYear && (
                  <text x={cx} y={baseY + 30} textAnchor="middle" className="chart-tick chart-tick--year">
                    {p.year}
                  </text>
                )}
                {i === maxIdx && (
                  <text x={cx} y={y(p.total) - 7} textAnchor="middle" className="chart-label">
                    {formatNumber(p.total, 0)}
                  </text>
                )}
                {/* veća zona dodira od samog stuba */}
                <rect
                  x={M.left + band * i}
                  y={M.top - 6}
                  width={band}
                  height={plotH + 6 + 24}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${MONTHS_LONG[p.month - 1]} ${p.year}: gorivo ${formatNumber(p.fuel, 0)} RSD, ostalo ${formatNumber(p.other, 0)} RSD, ukupno ${formatNumber(p.total, 0)} RSD`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(active === i ? null : i)}
                />
              </g>
            )
          })}
        </svg>

        {tip && (
          <div className="chart-tooltip" style={{ left: tipX, top: 28 }} role="presentation">
            <strong>
              {MONTHS_LONG[tip.month - 1]} {tip.year}.
            </strong>
            <span>
              <i style={{ background: FUEL.color }} />
              Gorivo <b>{formatNumber(tip.fuel, 0)}</b>
            </span>
            <span>
              <i style={{ background: OTHER.color }} />
              Ostalo <b>{formatNumber(tip.other, 0)}</b>
            </span>
            <span className="chart-tooltip-total">
              Ukupno <b>{formatNumber(tip.total, 0)} RSD</b>
            </span>
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary>Prikaži kao tabelu</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Mesec</th>
              <th scope="col">Gorivo</th>
              <th scope="col">Ostalo</th>
              <th scope="col">Ukupno</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.key}>
                <th scope="row">
                  {MONTHS_LONG[p.month - 1]} {p.year}.
                </th>
                <td>{formatNumber(p.fuel, 2)}</td>
                <td>{formatNumber(p.other, 2)}</td>
                <td>{formatNumber(p.total, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

export function CategoryBars({ items }: { items: CategoryShare[] }) {
  if (items.length === 0) return <p className="muted">Nema unosa sa iznosom u izabranom periodu.</p>
  const max = Math.max(...items.map((i) => i.amount))
  const hasFuel = items.some((i) => i.category === 'gorivo')
  const hasOther = items.some((i) => i.category !== 'gorivo')
  return (
    <div className="catbars">
      <Legend items={[...(hasFuel ? [FUEL] : []), ...(hasOther ? [{ ...OTHER, label: 'Ostale vrste' }] : [])]} />
      <ul className="catbars-list">
        {items.map((i) => (
          <li key={i.category}>
            <div className="catbars-head">
              <span>{categoryLabel(i.category)}</span>
              <span className="catbars-value">
                {formatNumber(i.amount, 0)} RSD <span className="muted">· {Math.round(i.share * 100)}%</span>
              </span>
            </div>
            <div className="catbars-track">
              <div
                className="catbars-fill"
                style={{ width: `${(i.amount / max) * 100}%`, background: i.category === 'gorivo' ? FUEL.color : OTHER.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
