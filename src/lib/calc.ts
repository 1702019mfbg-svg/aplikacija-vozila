import { addDays, addYears, daysInMonth, diffDays, monthIndex, monthKey, parseISO, toISO } from './dates'
import { MONTHS_SHORT, todayISO } from './format'
import type { Category, Expense, FuelPrice, FuelType, Vehicle } from './types'

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
/** Brojač ima najviše jednu decimalu; zaokruživanje skida plutajuće greške (4340,7 - 4321,5). */
export const round1 = (n: number): number => Math.round((n + Number.EPSILON) * 10) / 10

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

const inRange = (date: string, r: Range): boolean => (r.from === null || date >= r.from) && (r.to === null || date <= r.to)

export interface UsageSpan {
  /** brojač na početku perioda */
  from: number
  /** najveće očitavanje u periodu */
  to: number
  /** pređeni km ili odrađeni radni sati */
  used: number
}

/**
 * Pređeno u periodu: od brojača na početku perioda do najvećeg očitavanja u periodu (km ili radni sati).
 * Brojač na početku perioda je poslednje očitavanje pre perioda, a za prvi period početna vrednost brojača vozila:
 * vozilo je dodato kad je rezervoar bio pun, pa i prvo sipanje pokriva put od te tačke.
 * Ako početne tačke nema (početna vrednost je 0), potrebna su dva očitavanja u periodu.
 */
export function usageForPeriod(vehicle: Pick<Vehicle, 'initial_odometer'>, all: Expense[], range: Range): UsageSpan | null {
  const readings = filterByRange(all, range)
    .map((e) => e.odometer)
    .filter((o): o is number => o !== null)
  if (readings.length === 0) return null
  const to = Math.max(...readings)
  const lowest = Math.min(...readings)

  const earlier = all
    .filter((e) => e.odometer !== null && range.from !== null && e.expense_date < range.from)
    .map((e) => e.odometer as number)
  const base = earlier.length > 0 ? Math.max(...earlier) : vehicle.initial_odometer > 0 ? vehicle.initial_odometer : null
  const from = base !== null && base <= lowest ? base : lowest // početna tačka veća od očitavanja je greška u unosu
  const used = round1(to - from)
  return used > 0 ? { from, to, used } : null
}

export interface FuelStats {
  liters: number
  /** km ili radni sati obuhvaćeni obračunom (zbir razmaka između uzastopnih punih sipanja) */
  usage: number
  /** litara na 100 km (ili na 100 sati) */
  per100: number
  /** litara po jedinici: L/km ili L/h (za viljuškare se prikazuje L/h) */
  perUnit: number
  /** broj punih sipanja u lancu, računajući i početnu tačku ako je korišćena */
  fills: number
}

/**
 * Potrošnja metodom punog rezervoara. Razmak između dva uzastopna puna sipanja daje jedan obračun:
 * litri svih sipanja posle prethodnog punog (uključujući i to zadnje) podeljeni sa pređenim km (ili radnim satima).
 * U period ulaze obračuni čije je zatvarajuće (puno) sipanje u tom periodu, pa prvi obračun u periodu
 * koristi poslednje puno sipanje pre perioda.
 *
 * `start` je brojač vozila kad je rezervoar bio pun (početna kilometraža). Tako potrošnja može da se izračuna
 * već posle prvog punog sipanja. Bez njega potrebna su bar dva puna sipanja sa očitavanjem brojača.
 * Delimična sipanja pre prvog punog se ne računaju, a ona posle poslednjeg punog čekaju sledeće puno.
 */
export function fuelStats(list: Expense[], range: Range = { from: null, to: null }, start: number | null = null): FuelStats | null {
  const points = list
    .filter((e) => e.category === 'gorivo' && e.odometer !== null && e.liters !== null)
    .sort(
      (a, b) =>
        (a.odometer as number) - (b.odometer as number) ||
        a.expense_date.localeCompare(b.expense_date) ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((e) => ({ odometer: e.odometer as number, liters: e.liters as number, full: e.full_tank === true, date: e.expense_date as string | null }))
  if (start !== null && (points.length === 0 || start <= points[0].odometer)) {
    points.unshift({ odometer: start, liters: 0, full: true, date: null })
  }

  let ref: (typeof points)[number] | null = null
  let pending = 0
  let liters = 0
  let usage = 0
  let closing = 0
  for (const p of points) {
    if (ref !== null) pending += p.liters
    if (!p.full) continue
    if (ref !== null) {
      const km = round1(p.odometer - ref.odometer)
      if (km > 0 && p.date !== null && inRange(p.date, range)) {
        liters += pending
        usage += km
        closing++
      }
    }
    ref = p
    pending = 0
  }
  if (closing === 0) return null
  usage = round1(usage)
  return { liters: round2(liters), usage, per100: (liters / usage) * 100, perUnit: liters / usage, fills: closing + 1 }
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
  const to = [range.to ?? '9999-12-31', todayISO(now), addDays(endExclusive, -1)].reduce((a, b) => (a < b ? a : b))
  const days = Math.max(0, diffDays(to, from) + 1)
  return { amount: round2(daily * days), perMonth: round2((daily * 365.25) / 12), years: v.amort_years }
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
  /** pređeni km ili odrađeni radni sati u periodu */
  usage: number | null
  /** od kog do kog stanja brojača se računa pređeno */
  usageSpan: UsageSpan | null
  /** RSD po km (ili RSD po satu za mašine) */
  costPerUnit: number | null
  /** prosečno korišćenje mesečno (km ili sati) */
  usagePerMonth: number | null
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
  const usageSpan = usageForPeriod(vehicle, all, range)
  const usage = usageSpan?.used ?? null
  const months = monthsSpanned(list, range, now)
  return {
    range,
    list,
    count: list.length,
    pending: list.filter((e) => e.amount === null).length,
    expensesTotal,
    amort,
    total,
    usage,
    usageSpan,
    costPerUnit: usage ? total / usage : null,
    usagePerMonth: usage ? usage / months : null,
    // ceo spisak: prvi obračun u periodu se oslanja na poslednje puno sipanje pre perioda (ili na početnu kilometražu)
    fuel: fuelStats(all, range, vehicle.initial_odometer > 0 ? vehicle.initial_odometer : null),
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

/** Poslednja poznata vrednost brojača vozila (km ili radni sati). */
export function latestOdometer(vehicle: Vehicle, list: Expense[]): number {
  return list.reduce((max, e) => (e.odometer !== null && e.odometer > max ? e.odometer : max), vehicle.initial_odometer)
}

/** Cena goriva koja je važila na dati dan: poslednja upisana cena čiji "važi od" nije kasniji od tog dana. */
export function priceFor(prices: FuelPrice[], fuel: FuelType, date: string): FuelPrice | null {
  let best: FuelPrice | null = null
  for (const p of prices) {
    if (p.fuel_type === fuel && p.valid_from <= date && (best === null || p.valid_from > best.valid_from)) best = p
  }
  return best
}

/**
 * Sipanja bez upisanog iznosa dobijaju obračunat iznos: litri x cena goriva na dan sipanja.
 * Upisan iznos uvek ima prednost. Ako za taj dan nema cene, iznos ostaje prazan.
 * Ne menja ulaznu listu; obračunati unosi dobijaju oznaku `calc`.
 */
export function applyFuelPrices(list: Expense[], fuel: FuelType, prices: FuelPrice[]): Expense[] {
  if (prices.length === 0) return list
  return list.map((e) => {
    if (e.category !== 'gorivo' || e.amount !== null || e.liters === null) return e
    const p = priceFor(prices, fuel, e.expense_date)
    return p ? { ...e, amount: round2(e.liters * p.price), calc: { price: p.price, from: p.valid_from } } : e
  })
}

/** Cena po litru (ili po kWh) za jedno sipanje: obračunata cena, ili iznos / količina ako je iznos upisan. */
export function unitPrice(e: Expense): number | null {
  if (e.category !== 'gorivo' || e.liters === null || e.liters <= 0) return null
  if (e.calc) return e.calc.price
  return e.amount !== null ? round2(e.amount / e.liters) : null
}
