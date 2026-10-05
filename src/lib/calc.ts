import { addYears, daysInMonth, diffDays, monthIndex, monthKey, parseISO, toISO } from './dates'
import { MONTHS_SHORT, todayISO } from './format'
import type { Category, Expense, Vehicle } from './types'

export type Period = 'mesec' | 'godina' | '12m' | 'sve'
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'mesec', label: 'Mesec' },
  { id: 'godina', label: 'Godina' },
  { id: '12m', label: '12 meseci' },
  { id: 'sve', label: 'Sve' },
]

/** Granice perioda (uključivo), kao YYYY-MM-DD. null = bez granice. */
export interface Range {
  from: string | null
  to: string | null
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export function periodRange(period: Period, now = new Date()): Range {
  const { y, m } = parseISO(todayISO(now))
  switch (period) {
    case 'mesec':
      return { from: toISO(y, m, 1), to: toISO(y, m, daysInMonth(y, m)) }
    case 'godina':
      return { from: toISO(y, 1, 1), to: toISO(y, 12, 31) }
    case '12m': {
      // 12 kalendarskih meseci zaključno sa tekućim (isto kao grafikon po mesecima)
      const idx = y * 12 + (m - 1) - 11
      return { from: toISO(Math.floor(idx / 12), (idx % 12) + 1, 1), to: toISO(y, m, daysInMonth(y, m)) }
    }
    default:
      return { from: null, to: null }
  }
}

export function filterByRange<T extends { expense_date: string }>(list: T[], r: Range): T[] {
  return list.filter((e) => (r.from === null || e.expense_date >= r.from) && (r.to === null || e.expense_date <= r.to))
}

/** Zbir iznosa; unosi bez iznosa (null) se ne računaju. */
export const sumAmount = (list: Expense[]): number => round2(list.reduce((s, e) => s + (e.amount ?? 0), 0))

/** Pređeni km = najveća minus najmanja upisana kilometraža u listi. Potrebna su bar dva različita očitavanja. */
export function kmDriven(list: Expense[]): number | null {
  const odo = list.map((e) => e.odometer).filter((o): o is number => o !== null)
  if (odo.length < 2) return null
  const km = Math.max(...odo) - Math.min(...odo)
  return km > 0 ? km : null
}

export interface FuelStats {
  liters: number
  km: number
  per100: number
  fills: number
}

/**
 * Potrošnja metodom punog rezervoara: litri od prvog do poslednjeg punog sipanja
 * (bez prvog) podeljeni sa pređenim km između njih, puta 100.
 * Delimična sipanja između njih se računaju. Potrebna su bar dva puna sipanja sa kilometražom.
 */
export function fuelStats(list: Expense[]): FuelStats | null {
  const fuel = list
    .filter((e) => e.category === 'gorivo' && e.odometer !== null && e.liters !== null)
    .sort(
      (a, b) =>
        (a.odometer as number) - (b.odometer as number) ||
        a.expense_date.localeCompare(b.expense_date) ||
        a.created_at.localeCompare(b.created_at),
    )
  const full: number[] = []
  fuel.forEach((e, i) => {
    if (e.full_tank === true) full.push(i)
  })
  if (full.length < 2) return null
  const first = full[0]
  const last = full[full.length - 1]
  const km = (fuel[last].odometer as number) - (fuel[first].odometer as number)
  if (km <= 0) return null
  let liters = 0
  for (let i = first + 1; i <= last; i++) liters += fuel[i].liters as number
  return { liters: round2(liters), km, per100: (liters / km) * 100, fills: full.length }
}

export interface Amortization {
  amount: number // amortizacija za izabrani period
  perMonth: number
  years: number
}

/**
 * Nabavna cena ravnomerno raspoređena po danima na očekivani broj godina,
 * počevši od datuma kupovine. Računa se samo do danas.
 */
export function amortization(v: Vehicle, range: Range, now = new Date()): Amortization | null {
  if (v.purchase_price === null || !v.purchase_date || !v.amort_years) return null
  const start = v.purchase_date
  const endExclusive = addYears(start, v.amort_years)
  const daily = v.purchase_price / diffDays(endExclusive, start)
  const from = range.from !== null && range.from > start ? range.from : start
  // do kraja perioda, ali najkasnije do danas i do poslednjeg dana amortizacije
  const to = [range.to ?? '9999-12-31', todayISO(now), shiftDay(endExclusive, -1)].reduce((a, b) => (a < b ? a : b))
  const days = Math.max(0, diffDays(to, from) + 1)
  return { amount: round2(daily * days), perMonth: round2((daily * 365.25) / 12), years: v.amort_years }
}

function shiftDay(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Koliko kalendarskih meseci obuhvata period (od prvog unosa u periodu do tekućeg meseca), najmanje 1. */
export function monthsSpanned(list: Expense[], range: Range, now = new Date()): number {
  if (list.length === 0) return 1
  const first = list.reduce((min, e) => (e.expense_date < min ? e.expense_date : min), list[0].expense_date)
  const start = range.from !== null && range.from > first ? range.from : first
  return Math.max(1, monthIndex(todayISO(now)) - monthIndex(start) + 1)
}

export interface Summary {
  range: Range
  list: Expense[]
  count: number
  pending: number // unosi bez iznosa
  expensesTotal: number
  amort: Amortization | null
  total: number // troškovi (+ amortizacija ako je uključena)
  km: number | null
  costPerKm: number | null
  fuel: FuelStats | null
  months: number
  monthlyAvg: number
}

export function summarize(
  vehicle: Vehicle,
  all: Expense[],
  period: Period,
  opts: { includeAmort: boolean; now?: Date },
): Summary {
  const now = opts.now ?? new Date()
  const range = periodRange(period, now)
  const list = filterByRange(all, range)
  const expensesTotal = sumAmount(list)
  const amort = amortization(vehicle, range, now)
  const total = round2(expensesTotal + (opts.includeAmort && amort ? amort.amount : 0))
  const km = kmDriven(list)
  const months = monthsSpanned(list, range, now)
  return {
    range,
    list,
    count: list.length,
    pending: list.filter((e) => e.amount === null).length,
    expensesTotal,
    amort,
    total,
    km,
    costPerKm: km ? total / km : null,
    fuel: fuelStats(list),
    months,
    monthlyAvg: total / months,
  }
}

export interface MonthPoint {
  key: string // 2026-10
  label: string // okt
  year: number
  month: number
  fuel: number
  other: number
  total: number
}

/** Poslednjih n kalendarskih meseci (uključujući tekući), od najstarijeg ka najnovijem. */
export function monthlySeries(list: Expense[], now = new Date(), n = 12): MonthPoint[] {
  const { y, m } = parseISO(todayISO(now))
  const points: MonthPoint[] = []
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i
    const year = Math.floor(idx / 12)
    const month = (idx % 12) + 1
    points.push({ key: `${year}-${String(month).padStart(2, '0')}`, label: MONTHS_SHORT[month - 1], year, month, fuel: 0, other: 0, total: 0 })
  }
  const byKey = new Map(points.map((p) => [p.key, p]))
  for (const e of list) {
    const p = byKey.get(monthKey(e.expense_date))
    if (!p || e.amount === null) continue
    if (e.category === 'gorivo') p.fuel += e.amount
    else p.other += e.amount
  }
  for (const p of points) {
    p.fuel = round2(p.fuel)
    p.other = round2(p.other)
    p.total = round2(p.fuel + p.other)
  }
  return points
}

export interface CategoryShare {
  category: Category
  amount: number
  share: number // 0..1
}

export function byCategory(list: Expense[]): CategoryShare[] {
  const sums = new Map<Category, number>()
  for (const e of list) if (e.amount) sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount)
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount), share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/** Poslednja poznata kilometraža vozila. */
export function latestOdometer(vehicle: Vehicle, list: Expense[]): number {
  return list.reduce((max, e) => (e.odometer !== null && e.odometer > max ? e.odometer : max), vehicle.initial_odometer)
}
