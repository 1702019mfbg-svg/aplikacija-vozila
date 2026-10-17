import { describe, expect, it } from 'vitest'
import {
  amortization, byCategory, filterByRange, fuelRows, fuelStats, usageForPeriod, latestOdometer, monthlySeries, monthsSpanned,
  periodRange, sumAmount, summarize, priceFor, applyFuelPrices, unitPrice,
} from '../src/lib/calc'
import { buildCsv, csvFilename } from '../src/lib/csv'
import { addMonths, diffDays, startOfWeek } from '../src/lib/dates'
import { formatDate, formatMeter, formatNumber, formatRSD, meterName, parseDecimal, parseInteger, parseMeter, plural, todayISO } from '../src/lib/format'
import { REMINDER_PRESETS, WARN_DAYS, collectAlerts, evaluateReminder, markDone, nextDueDate, presetFor, sortByUrgency } from '../src/lib/reminders'
import { CATEGORIES, type Expense, type FuelPrice, type Reminder, type Vehicle } from '../src/lib/types'
import { SECTION_COPY, categoriesFor, consumptionUnit, reminderTypesFor, sectionOf, unitOfSection, vehiclesIn } from '../src/lib/sections'

const NOW = new Date(2026, 9, 5, 12, 0, 0) // 5. oktobar 2026.

let seq = 0
function exp(p: Partial<Expense>): Expense {
  seq++
  return {
    id: `e${seq}`, vehicle_id: 'v1', expense_date: '2026-10-01', category: 'putarina', amount: 100,
    odometer: null, liters: null, full_tank: null, note: null, driver_id: null, driver_name: null,
    created_at: `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}Z`, ...p,
  }
}
const fill = (odometer: number, liters: number, full: boolean, p: Partial<Expense> = {}) =>
  exp({ category: 'gorivo', odometer, liters, full_tank: full, ...p })

const vehicle: Vehicle = {
  id: 'v1', name: 'Golf', plate: 'BG-123-AA', fuel_type: 'Dizel', meter_unit: 'km', initial_odometer: 100000,
  purchase_date: null, purchase_price: null, amort_years: null,
}

describe('format', () => {
  it('formatira brojeve na srpski način', () => {
    expect(formatNumber(1234.56)).toBe('1.234,56')
    expect(formatNumber(0)).toBe('0,00')
    expect(formatNumber(999.999)).toBe('1.000,00')
    expect(formatNumber(-1234.5)).toBe('-1.234,50')
    expect(formatNumber(1234567.891, 0)).toBe('1.234.568')
    expect(formatNumber(-0.001)).toBe('0,00')
    expect(formatNumber(NaN)).toBe('–')
    expect(formatRSD(1500)).toBe('1.500,00 RSD')
  })

  it('čita unos korisnika u raznim zapisima', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56)
    expect(parseDecimal('1234.56')).toBe(1234.56)
    expect(parseDecimal('1234,56')).toBe(1234.56)
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal('1.234')).toBe(1234) // srpski zapis hiljada
    expect(parseDecimal('1 234,5')).toBe(1234.5)
    expect(parseDecimal(' 40 ')).toBe(40)
    expect(parseDecimal('1.234.567')).toBe(1234567)
    for (const bad of ['', '  ', 'abc', '1,2,3', '1.2.3', '.', ',', '-5', '12e3', '1,5 L']) {
      expect(parseDecimal(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(parseInteger('123.456')).toBe(123456)
    expect(parseInteger('123 456')).toBe(123456)
    expect(parseInteger('12,5')).toBeNull()
  })

  it('datumi i množina', () => {
    expect(formatDate('2026-10-05')).toBe('05.10.2026.')
    expect(formatDate('2026-10-05', false)).toBe('05.10.2026')
    expect(formatDate(null)).toBe('')
    expect(todayISO(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02')
    const word = (n: number) => plural(n, 'dan', 'dana', 'dana')
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(word)).toEqual(
      ['dan', 'dana', 'dana', 'dana', 'dana', 'dana', 'dana', 'dan', 'dana', 'dana', 'dan', 'dana'],
    )
  })

  it('računanje sa datumima', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-03-15', -4)).toBe('2025-11-15')
    expect(diffDays('2026-03-29', '2026-03-28')).toBe(1) // prelazak na letnje računanje vremena
    expect(diffDays('2026-10-25', '2026-10-24')).toBe(1)
  })
})

describe('periodi', () => {
  it('računa granice perioda', () => {
    expect(periodRange('mesec', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('godina', NOW)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodRange('12m', NOW)).toEqual({ from: '2025-11-01', to: '2026-10-31' })
    expect(periodRange('sve', NOW)).toEqual({ from: null, to: null })
    expect(periodRange('mesec', new Date(2028, 1, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('filtrira uključujući granice', () => {
    const list = [exp({ expense_date: '2026-09-30' }), exp({ expense_date: '2026-10-01' }), exp({ expense_date: '2026-10-31' }), exp({ expense_date: '2026-11-01' })]
    expect(filterByRange(list, periodRange('mesec', NOW)).map((e) => e.expense_date)).toEqual(['2026-10-01', '2026-10-31'])
    expect(filterByRange(list, periodRange('sve', NOW))).toHaveLength(4)
  })
})

describe('pređeni kilometri', () => {
  const sve = { from: null, to: null }

  it('od početne kilometraže vozila do najveće upisane: prvo sipanje pokriva put od početne', () => {
    const list = [exp({ odometer: 100800 }), exp({ odometer: 101600 }), exp({})]
    expect(usageForPeriod(vehicle, list, sve)).toEqual({ from: 100000, to: 101600, used: 1600 })
  })

  it('računa se već posle prvog unosa sa kilometražom', () => {
    expect(usageForPeriod(vehicle, [exp({ odometer: 100800 })], sve)!.used).toBe(800)
  })

  it('u kasnijem periodu kreće od poslednjeg očitavanja pre perioda', () => {
    const list = [
      exp({ expense_date: '2026-09-20', odometer: 100800 }),
      exp({ expense_date: '2026-10-03', odometer: 101300 }),
      exp({ expense_date: '2026-10-04', odometer: 101600 }),
    ]
    expect(usageForPeriod(vehicle, list, periodRange('mesec', NOW))).toEqual({ from: 100800, to: 101600, used: 800 })
  })

  it('bez početne kilometraže (0) potrebna su dva očitavanja: najveće minus najmanje', () => {
    const v0 = { ...vehicle, initial_odometer: 0 }
    expect(usageForPeriod(v0, [exp({ odometer: 1000 })], sve)).toBeNull()
    expect(usageForPeriod(v0, [exp({ odometer: 1000 }), exp({ odometer: 1500 }), exp({ odometer: 1200 })], sve)!.used).toBe(500)
  })

  it('početna kilometraža veća od upisane (greška u unosu) se zanemaruje', () => {
    expect(usageForPeriod(vehicle, [exp({ odometer: 99000 }), exp({ odometer: 99500 })], sve)!.used).toBe(500)
  })

  it('bez očitavanja ili bez pomaka nema odgovora', () => {
    expect(usageForPeriod(vehicle, [], sve)).toBeNull()
    expect(usageForPeriod(vehicle, [exp({})], sve)).toBeNull()
    expect(usageForPeriod(vehicle, [exp({ odometer: 100000 })], sve)).toBeNull()
  })
})

describe('potrošnja metodom punog rezervoara', () => {
  it('litri posle prvog punog do poslednjeg punog, podeljeno sa km', () => {
    // puno 10000 (baza), delimično 10300 (20 L), puno 10600 (30 L), puno 11000 (35 L)
    // litri = 20 + 30 + 35 = 85, km = 1000 -> 8,5 L/100 km
    const list = [fill(11000, 35, true), fill(10000, 40, true), fill(10600, 30, true), fill(10300, 20, false)]
    const s = fuelStats(list)!
    expect(s.liters).toBe(85)
    expect(s.usage).toBe(1000)
    expect(s.per100).toBeCloseTo(8.5, 10)
    expect(s.fills).toBe(3)
  })

  it('prvo sipanje se ne računa u litre', () => {
    const s = fuelStats([fill(1000, 50, true), fill(1500, 40, true)])!
    expect(s.liters).toBe(40)
    expect(s.per100).toBeCloseTo(8, 10)
  })

  it('delimična sipanja pre prvog punog i posle poslednjeg punog se ne računaju', () => {
    const s = fuelStats([fill(900, 10, false), fill(1000, 50, true), fill(1500, 40, true), fill(1700, 15, false)])!
    expect(s.liters).toBe(40)
    expect(s.usage).toBe(500)
  })

  it('treba bar dva puna sipanja sa kilometražom', () => {
    expect(fuelStats([])).toBeNull()
    expect(fuelStats([fill(1000, 50, true)])).toBeNull()
    expect(fuelStats([fill(1000, 50, true), fill(1400, 30, false)])).toBeNull()
    expect(fuelStats([fill(1000, 50, true), exp({ category: 'gorivo', odometer: null, liters: 40, full_tank: true })])).toBeNull()
    expect(fuelStats([fill(1000, 50, true), fill(1000, 50, true)])).toBeNull()
  })

  it('ne meša gorivo sa ostalim troškovima', () => {
    const list = [fill(1000, 50, true), exp({ category: 'servis', odometer: 1200 }), fill(1500, 40, true)]
    expect(fuelStats(list)!.liters).toBe(40)
  })

  const sve = { from: null, to: null }

  it('sa početnom kilometražom (rezervoar je tada bio pun) računa se već posle prvog punog sipanja', () => {
    const s = fuelStats([fill(100800, 160, true)], sve, 100000)!
    expect(s.liters).toBe(160)
    expect(s.usage).toBe(800)
    expect(s.per100).toBeCloseTo(20, 10)
  })

  it('primer iz prakse: pun na početku, pa dva puna sipanja; računaju se oba', () => {
    // bez početne tačke: samo drugo sipanje na 899 km; sa njom: 170 + 173 L na 1.799 km
    const list = [fill(100900, 170, true), fill(101799, 173, true)]
    expect(fuelStats(list)!.usage).toBe(899)
    const s = fuelStats(list, sve, 100000)!
    expect(s.liters).toBe(343)
    expect(s.usage).toBe(1799)
  })

  it('delimična sipanja posle početka ulaze u prvo puno sipanje', () => {
    const s = fuelStats([fill(100300, 20, false), fill(100600, 40, true)], sve, 100000)!
    expect(s.liters).toBe(60)
    expect(s.usage).toBe(600)
  })

  it('početna tačka iznad prvog sipanja se ne koristi (greška u unosu)', () => {
    expect(fuelStats([fill(1000, 50, true), fill(1500, 40, true)], sve, 2000)!.liters).toBe(40)
  })

  it('u periodu: prvi obračun se oslanja na poslednje puno sipanje pre perioda', () => {
    const list = [fill(100000, 50, true, { expense_date: '2026-09-25' }), fill(100500, 40, true, { expense_date: '2026-10-03' })]
    const s = fuelStats(list, periodRange('mesec', NOW))!
    expect(s.liters).toBe(40)
    expect(s.usage).toBe(500)
    // kad u periodu nema punog sipanja, nema ni obračuna
    expect(fuelStats([fill(100500, 50, true, { expense_date: '2026-09-25' })], periodRange('mesec', NOW), 100000)).toBeNull()
  })
})

describe('potrošnja posle svakog sipanja', () => {
  it('svako puno sipanje dobija svoju potrošnju i cenu goriva po km', () => {
    // pun na 100.000; 100.900 puno 180 L (40.320 RSD); 101.200 delimično 50 L; 101.800 puno 130 L (29.120 RSD)
    const rows = fuelRows(
      [
        fill(100900, 180, true, { amount: 40320 }),
        fill(101200, 50, false, { amount: 11200 }),
        fill(101800, 130, true, { amount: 29120 }),
      ],
      100000,
    )
    expect(rows.map((r) => r.status)).toEqual(['ok', 'partial', 'ok'])
    expect(rows[0]).toMatchObject({ distance: 900, liters: 180, partials: 0, cost: 40320 })
    expect(rows[0].per100).toBeCloseTo(20, 10)
    expect(rows[0].costPerUnit).toBeCloseTo(44.8, 10)
    // delimično ulazi u sledeće puno: 50 + 130 L na 900 km
    expect(rows[2]).toMatchObject({ distance: 900, liters: 180, partials: 1, cost: 40320 })
  })

  it('bez početne kilometraže prvo puno sipanje je samo početak', () => {
    const rows = fuelRows([fill(1000, 50, false), fill(1100, 50, true), fill(1600, 40, true)])
    expect(rows.map((r) => r.status)).toEqual(['first', 'first', 'ok'])
    expect(rows[2]).toMatchObject({ distance: 500, liters: 40 })
  })

  it('bez kilometraže, ili sa kilometražom koja nije veća od prethodne, nema potrošnje', () => {
    const rows = fuelRows([fill(1000, 50, true), fill(1000, 40, true), exp({ category: 'gorivo', liters: 30, full_tank: true })], 900)
    const byStatus = rows.map((r) => r.status).sort()
    expect(byStatus).toEqual(['bad_meter', 'no_meter', 'ok'])
  })

  it('kad nekom sipanju nedostaje iznos, cena po km se ne računa, a potrošnja da', () => {
    const rows = fuelRows([fill(1300, 10, false, { amount: null }), fill(1500, 40, true, { amount: 8000 })], 1000)
    expect(rows[1].cost).toBeNull()
    expect(rows[1].costPerUnit).toBeNull()
    expect(rows[1].per100).toBeCloseTo(10, 10)
  })

  it('pregled daje sipanja iz perioda, najnovija prva, i zbir iz istih redova', () => {
    const v = { ...vehicle, initial_odometer: 300000 }
    const list = [
      fill(300900, 178, true, { expense_date: '2026-09-28', amount: 40000 }),
      fill(301799, 173, true, { expense_date: '2026-10-02', amount: 40054 }),
      fill(302700, 175, true, { expense_date: '2026-10-04', amount: 40100 }),
    ]
    const s = summarize(v, list, 'mesec', { includeAmort: false, now: NOW })
    expect(s.fuelLog.map((r) => r.expense.odometer)).toEqual([302700, 301799])
    expect(s.fuelLog[1].distance).toBe(899) // od septembarskog punog sipanja
    expect(s.fuel!.liters).toBe(348)
    expect(s.fuel!.usage).toBe(1800)
  })
})

describe('amortizacija', () => {
  const v: Vehicle = { ...vehicle, purchase_date: '2024-01-01', purchase_price: 1_200_000, amort_years: 10 }
  // 10 godina od 1.1.2024 = 3653 dana (prestupne 2024, 2028, 2032)
  const daily = 1_200_000 / 3653

  it('raspoređuje nabavnu cenu po danima', () => {
    expect(diffDays('2034-01-01', '2024-01-01')).toBe(3653)
    const a = amortization(v, { from: '2025-01-01', to: '2025-12-31' }, NOW)!
    expect(a.amount).toBeCloseTo(daily * 365, 2)
    expect(a.perMonth).toBeCloseTo((daily * 365.25) / 12, 2)
    expect(a.years).toBe(10)
  })

  it('računa samo do danas', () => {
    const a = amortization(v, { from: '2025-01-01', to: '2025-12-31' }, new Date(2025, 5, 15))!
    expect(a.amount).toBeCloseTo(daily * 166, 2) // 1.1. do 15.6.2025.
  })

  it('"Sve" kreće od datuma kupovine', () => {
    const a = amortization(v, { from: null, to: null }, new Date(2026, 0, 1))!
    expect(a.amount).toBeCloseTo(daily * 732, 2) // 1.1.2024 do 1.1.2026 uključivo
  })

  it('pre kupovine i posle isteka nema amortizacije', () => {
    expect(amortization(v, { from: '2023-01-01', to: '2023-12-31' }, NOW)!.amount).toBe(0)
    const after = amortization(v, { from: null, to: null }, new Date(2040, 0, 1))!
    expect(after.amount).toBeCloseTo(1_200_000, 0) // cela nabavna cena, ne više
  })

  it('bez podataka o nabavci vraća null', () => {
    expect(amortization(vehicle, { from: null, to: null }, NOW)).toBeNull()
    expect(amortization({ ...v, amort_years: null }, { from: null, to: null }, NOW)).toBeNull()
    expect(amortization({ ...v, purchase_price: null }, { from: null, to: null }, NOW)).toBeNull()
  })
})

describe('pregled', () => {
  const list = [
    exp({ expense_date: '2026-10-02', category: 'gorivo', amount: 8000, odometer: 100000, liters: 50, full_tank: true }),
    exp({ expense_date: '2026-10-04', category: 'putarina', amount: 500, odometer: 100200 }),
    exp({ expense_date: '2026-10-04', category: 'servis', amount: 4500, odometer: 100500, note: 'ulje' }),
    exp({ expense_date: '2026-10-05', category: 'ostalo', amount: null, note: 'kafa', driver_name: 'Marko' }),
    exp({ expense_date: '2026-09-01', category: 'servis', amount: 20000, odometer: 99000 }),
  ]

  it('cena po km = zbir u periodu / pređeno od poslednjeg očitavanja pre perioda', () => {
    const s = summarize(vehicle, list, 'mesec', { includeAmort: false, now: NOW })
    expect(s.count).toBe(4)
    expect(s.expensesTotal).toBe(13000) // 8000 + 500 + 4500, unos bez iznosa se ne računa
    expect(s.pending).toBe(1)
    expect(s.usage).toBe(1500) // 100500 - 99000 (poslednje očitavanje pre oktobra je iz septembra)
    expect(s.usageSpan).toEqual({ from: 99000, to: 100500, used: 1500 })
    expect(s.costPerUnit).toBeCloseTo(13000 / 1500, 10)
    expect(s.months).toBe(1)
    expect(s.monthlyAvg).toBe(13000)
  })

  it('period "Sve" obuhvata i starije unose, a prosek je po mesecima od prvog unosa', () => {
    const s = summarize(vehicle, list, 'sve', { includeAmort: false, now: NOW })
    expect(s.expensesTotal).toBe(33000)
    expect(s.usage).toBe(1500) // 100500 - 99000 (početna 100.000 je veća od prvog očitavanja, pa se ne koristi)
    expect(s.costPerUnit).toBeCloseTo(22, 10)
    expect(s.months).toBe(2) // septembar i oktobar
    expect(s.monthlyAvg).toBe(16500)
  })

  it('amortizacija ulazi u cenu po km samo kad je uključena, ali se uvek računa posebno', () => {
    const v = { ...vehicle, purchase_date: '2026-01-01', purchase_price: 1_000_000, amort_years: 5 }
    const off = summarize(v, list, 'mesec', { includeAmort: false, now: NOW })
    const on = summarize(v, list, 'mesec', { includeAmort: true, now: NOW })
    const days = 5 // 1. do 5. oktobra
    const perDay = 1_000_000 / diffDays('2031-01-01', '2026-01-01')
    expect(off.amort!.amount).toBeCloseTo(perDay * days, 2)
    expect(off.total).toBe(13000)
    expect(on.total).toBeCloseTo(13000 + perDay * days, 1)
    expect(on.costPerUnit!).toBeGreaterThan(off.costPerUnit!)
    expect(on.costPerUnit).toBeCloseTo(on.total / 1500, 10)
  })

  it('primer iz prakse: kamion pun na početku, dva sipanja, oko 45 umesto 90 RSD/km', () => {
    const v = { ...vehicle, initial_odometer: 300000 }
    const list = [
      fill(300900, 178, true, { expense_date: '2026-10-02', amount: 40054 }),
      fill(301799, 173, true, { expense_date: '2026-10-04', amount: 40054 }),
    ]
    const s = summarize(v, list, 'mesec', { includeAmort: false, now: NOW })
    expect(s.usage).toBe(1799) // ranije 899 (samo između dva sipanja)
    expect(s.costPerUnit).toBeCloseTo(80108 / 1799, 8) // 44,53 RSD/km
    expect(s.fuel!.liters).toBe(351)
    expect(s.fuel!.per100).toBeCloseTo((351 / 1799) * 100, 8)
  })

  it('bez dovoljno kilometraže nema cene po km', () => {
    const s = summarize(vehicle, [exp({ amount: 100 })], 'mesec', { includeAmort: false, now: NOW })
    expect(s.costPerUnit).toBeNull()
    expect(s.usage).toBeNull()
  })

  it('prazna lista ne ruši ništa', () => {
    const s = summarize(vehicle, [], 'godina', { includeAmort: true, now: NOW })
    expect(s.total).toBe(0)
    expect(s.monthlyAvg).toBe(0)
    expect(s.fuel).toBeNull()
  })

  it('monthsSpanned', () => {
    const l = [exp({ expense_date: '2026-07-20' })]
    expect(monthsSpanned(l, periodRange('godina', NOW), NOW)).toBe(4) // jul, avg, sep, okt
    expect(monthsSpanned([exp({ expense_date: '2026-10-02' })], periodRange('mesec', NOW), NOW)).toBe(1)
    expect(monthsSpanned([], periodRange('godina', NOW), NOW)).toBe(1)
    expect(monthsSpanned([exp({ expense_date: '2025-02-01' })], periodRange('12m', NOW), NOW)).toBe(12) // počinje od granice perioda
  })

  it('zbir zaokružuje na pare bez plutajuće greške', () => {
    expect(sumAmount([exp({ amount: 0.1 }), exp({ amount: 0.2 })])).toBe(0.3)
  })
})

describe('grafikoni', () => {
  it('poslednjih 12 meseci, od najstarijeg, gorivo odvojeno od ostalog', () => {
    const list = [
      exp({ expense_date: '2026-10-02', category: 'gorivo', amount: 8000 }),
      exp({ expense_date: '2026-10-03', category: 'servis', amount: 1000.5 }),
      exp({ expense_date: '2026-10-03', category: 'servis', amount: null }),
      exp({ expense_date: '2025-11-30', category: 'putarina', amount: 300 }),
      exp({ expense_date: '2025-10-31', category: 'putarina', amount: 999 }), // pre prozora
    ]
    const s = monthlySeries(list, NOW)
    expect(s).toHaveLength(12)
    expect(s[0].key).toBe('2025-11')
    expect(s[0].other).toBe(300)
    expect(s[11].key).toBe('2026-10')
    expect(s[11].label).toBe('okt')
    expect(s[11].fuel).toBe(8000)
    expect(s[11].other).toBe(1000.5)
    expect(s[11].total).toBe(9000.5)
    expect(s.slice(1, 11).every((p) => p.total === 0)).toBe(true)
  })

  it('raspodela po vrstama: opadajuće, udeli daju 100%', () => {
    const r = byCategory([
      exp({ category: 'gorivo', amount: 600 }), exp({ category: 'servis', amount: 300 }),
      exp({ category: 'gorivo', amount: 100 }), exp({ category: 'parking', amount: null }),
    ])
    expect(r.map((x) => x.category)).toEqual(['gorivo', 'servis'])
    expect(r[0].amount).toBe(700)
    expect(r[0].share).toBeCloseTo(0.7, 10)
    expect(r.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10)
  })

  it('poslednja kilometraža uzima u obzir početnu', () => {
    expect(latestOdometer(vehicle, [])).toBe(100000)
    expect(latestOdometer(vehicle, [exp({ odometer: 105000 }), exp({ odometer: 103000 })])).toBe(105000)
    expect(latestOdometer(vehicle, [exp({ odometer: 50 })])).toBe(100000)
  })
})

describe('podsetnici', () => {
  const base: Reminder = {
    id: 'r1', vehicle_id: 'v1', type: 'registracija', title: 'Registracija', due_date: null,
    interval_meter: null, interval_months: null, last_date: null, last_meter: null,
  }
  const servis = (p: Partial<Reminder>): Reminder => ({ ...base, type: 'servis', title: 'Servis', ...p })

  it('datum isteka: ok, uskoro, isteklo', () => {
    const ev = (due: string) => evaluateReminder({ ...base, due_date: due }, 0, NOW)
    expect(ev('2026-12-31').status).toBe('ok')
    expect(ev('2026-11-04').status).toBe('soon') // tačno 30 dana
    expect(ev('2026-11-05').status).toBe('ok') // 31 dan
    expect(ev('2026-10-20').status).toBe('soon')
    expect(ev('2026-10-20').parts[0]).toBe('Za 15 dana (20.10.2026.)')
    expect(ev('2026-10-05').parts[0]).toBe('Ističe danas (05.10.2026.)')
    expect(ev('2026-10-05').status).toBe('soon')
    expect(ev('2026-10-01').status).toBe('overdue')
    expect(ev('2026-10-01').parts[0]).toBe('Isteklo pre 4 dana (01.10.2026.)')
  })

  it('tehnički pregled, registracija i tahograf: upozorenje počinje tačno 30 dana pre isteka', () => {
    for (const type of ['tehnicki', 'registracija', 'tahograf'] as const) {
      const r: Reminder = { ...base, type, title: type }
      expect(evaluateReminder({ ...r, due_date: '2026-11-04' }, 0, NOW).status, `${type} 30 dana`).toBe('soon')
      expect(evaluateReminder({ ...r, due_date: '2026-11-05' }, 0, NOW).status, `${type} 31 dan`).toBe('ok')
    }
    expect(WARN_DAYS).toBe(30)
  })

  it('servis na svakih X km', () => {
    const r = servis({ interval_meter: 10000, last_meter: 100000 })
    expect(evaluateReminder(r, 105000, NOW).status).toBe('ok')
    expect(evaluateReminder(r, 109000, NOW).status).toBe('soon') // tačno 1000 km do roka
    expect(evaluateReminder(r, 108999, NOW).status).toBe('ok')
    expect(evaluateReminder(r, 109500, NOW).meterLeft).toBe(500)
    expect(evaluateReminder(r, 110001, NOW).status).toBe('overdue')
    expect(evaluateReminder(r, 110300, NOW).parts[0]).toBe('Prekoračeno za 300 km (rok 110.000 km)')
  })

  it('servis na svakih X meseci', () => {
    const st = evaluateReminder(servis({ interval_months: 12, last_date: '2025-10-20' }), 0, NOW)
    expect(st.dueDate).toBe('2026-10-20')
    expect(st.status).toBe('soon')
  })

  it('kad su zadata oba, važi lošiji', () => {
    const r = servis({ interval_meter: 10000, last_meter: 100000, interval_months: 12, last_date: '2026-09-01' })
    expect(evaluateReminder(r, 111000, NOW).status).toBe('overdue') // km prekoračen, datum je daleko
    expect(evaluateReminder(r, 100000, NOW).status).toBe('ok')
  })

  it('servis bez poslednjeg servisa ne puca', () => {
    const st = evaluateReminder(servis({ interval_meter: 10000 }), 5000, NOW)
    expect(st.status).toBe('ok')
    expect(st.parts[0]).toMatch(/Upišite poslednji servis/)
  })

  it('šabloni: tehnički na 6 meseci, registracija na 12, tahograf na 24', () => {
    const m = (t: string) => presetFor(t as any)
    expect([m('tehnicki').interval_months, m('registracija').interval_months, m('tahograf').interval_months]).toEqual([6, 12, 24])
    expect(REMINDER_PRESETS.map((p) => p.type)).toEqual(['tehnicki', 'registracija', 'tahograf', 'servis', 'ostalo'])
  })

  it('"urađeno": tehnički pregled se pomera za 6 meseci', () => {
    const tp: Reminder = { ...base, type: 'tehnicki', title: 'Tehnički pregled', due_date: '2026-10-20', interval_months: 6 }
    expect(markDone(tp, 0, '2026-10-05').due_date).toBe('2027-04-20') // urađeno ranije: od starog roka
    expect(nextDueDate({ ...tp, due_date: '2026-09-01' }, '2026-10-05')).toBe('2027-04-05') // zakasnilo: od dana obavljanja
    const done = markDone(tp, 0, '2026-10-05')
    expect(done.title).toBe('Tehnički pregled')
    expect('id' in done).toBe(false)
  })

  it('"urađeno": registracija +12, tahograf +24 meseca, nepoznato obnavljanje +12', () => {
    const reg: Reminder = { ...base, due_date: '2026-10-20', interval_months: 12 }
    expect(markDone(reg, 0, '2026-10-05').due_date).toBe('2027-10-20')
    const tah: Reminder = { ...base, type: 'tahograf', due_date: '2026-12-01', interval_months: 24 }
    expect(markDone(tah, 0, '2026-10-05').due_date).toBe('2028-12-01')
    expect(markDone({ ...reg, interval_months: null }, 0, '2026-10-05').due_date).toBe('2027-10-20')
  })

  it('"urađeno": servis kreće od danas i tekuće kilometraže', () => {
    const serv = servis({ interval_meter: 10000, interval_months: 12, last_date: '2025-01-01', last_meter: 90000 })
    const done = markDone(serv, 101500, '2026-10-05')
    expect(done.last_date).toBe('2026-10-05')
    expect(done.last_meter).toBe(101500)
    // servis samo na km ne dira datum
    const kmOnly = markDone(servis({ interval_meter: 10000, last_date: '2025-01-01', last_meter: 90000 }), 101500, '2026-10-05')
    expect(kmOnly.last_date).toBe('2025-01-01')
    expect(kmOnly.last_meter).toBe(101500)
  })

  it('najhitnije prvo', () => {
    const mk = (title: string, due: string) => ({ title, state: evaluateReminder({ ...base, title, due_date: due }, 0, NOW) })
    const sorted = sortByUrgency([mk('daleko', '2027-05-01'), mk('uskoro', '2026-10-20'), mk('isteklo', '2026-09-01'), mk('uskoro2', '2026-10-10')])
    expect(sorted.map((s) => s.title)).toEqual(['isteklo', 'uskoro2', 'uskoro', 'daleko'])
  })

  it('upozorenja za sva vozila odjednom, samo ona kojima se rok bliži', () => {
    const v2: Vehicle = { ...vehicle, id: 'v2', name: 'Kombi', initial_odometer: 0 }
    const all: Reminder[] = [
      { ...base, id: 'a', vehicle_id: 'v1', type: 'tehnicki', title: 'Tehnički pregled', due_date: '2026-10-20' }, // uskoro
      { ...base, id: 'b', vehicle_id: 'v2', type: 'registracija', due_date: '2026-09-30' }, // isteklo
      { ...base, id: 'c', vehicle_id: 'v2', type: 'tahograf', title: 'Tahograf', due_date: '2028-01-01' }, // daleko
      servis({ id: 'd', vehicle_id: 'v1', interval_meter: 10000, last_meter: 100000 }), // km: 105000 -> ok
      { ...base, id: 'x', vehicle_id: 'nepostojece', due_date: '2020-01-01' }, // vozilo obrisano
    ]
    const alerts = collectAlerts(all, [vehicle, v2], { v1: 105000, v2: 3000 }, NOW)
    expect(alerts.map((a) => `${a.vehicle.name}:${a.reminder.id}:${a.state.status}`)).toEqual(['Kombi:b:overdue', 'Golf:a:soon'])
  })
})

describe('CSV izvoz', () => {
  const rows = [
    exp({ expense_date: '2026-10-05', category: 'gorivo', amount: 8123.5, odometer: 100500, liters: 40.25, full_tank: true, driver_name: 'Marko' }),
    exp({ expense_date: '2026-10-01', category: 'ostalo', amount: null, note: 'Kafa; \"velika\"\nbez šećera' }),
    exp({ expense_date: '2026-10-03', category: 'servis', amount: 4500, note: '=HYPERLINK("http://x")' }),
  ]
  const csv = buildCsv(rows, vehicle)

  it('UTF-8 sa BOM, CRLF i separator ";"', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.split('\r\n')[0]).toBe(
      '\uFEFFDatum;Vozilo;Registracija;Vrsta;Iznos (RSD);Kilometraža;Litara;Pun rezervoar;Napomena;Uneo;Cena po litru (RSD);Iznos obračunat po ceni goriva',
    )
  })

  it('decimalni zarez, redom po datumu, prazno polje za nepoznat iznos', () => {
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1].startsWith('01.10.2026;Golf;BG-123-AA;Ostalo;;;;;')).toBe(true)
    expect(lines[3]).toBe('05.10.2026;Golf;BG-123-AA;Gorivo;8123,50;100500;40,25;Da;;Marko;201,83;') // 8123,50 / 40,25
  })

  it('polja sa ; navodnicima i novim redom ostaju u jednom polju', () => {
    expect(csv).toContain('"Kafa; ""velika"" bez šećera"')
  })

  it('formule iz napomene se neutrališu (CSV injection)', () => {
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")"')
    expect(csv).not.toMatch(/;=HYPERLINK/)
  })

  it('naziv fajla', () => {
    expect(csvFilename({ ...vehicle, name: 'Škoda Octavia (kombi)!' }, new Date('2026-10-05T10:00:00Z'))).toBe('troskovi-koda-octavia-kombi-2026-10-05.csv')
    expect(csvFilename({ ...vehicle, name: '???' }, new Date('2026-10-05T10:00:00Z'))).toBe('troskovi-vozilo-2026-10-05.csv')
  })
})

describe('viljuškari: radni sati umesto kilometara', () => {
  const forklift: Vehicle = {
    id: 'f1', name: 'Linde H25', plate: null, fuel_type: 'TNG', meter_unit: 'h', initial_odometer: 4200,
    purchase_date: null, purchase_price: null, amort_years: null,
  }
  // sati: puno 4300,0 (baza), delimično 4310,5 (15 L), puno 4320,5 (45 L), servis 4330,0, puno 4340,7 (60 L)
  const list = [
    exp({ vehicle_id: 'f1', expense_date: '2026-10-01', category: 'gorivo', amount: 8000, odometer: 4300, liters: 40, full_tank: true }),
    exp({ vehicle_id: 'f1', expense_date: '2026-10-02', category: 'gorivo', amount: 3000, odometer: 4310.5, liters: 15, full_tank: false }),
    exp({ vehicle_id: 'f1', expense_date: '2026-10-03', category: 'gorivo', amount: 9000, odometer: 4320.5, liters: 45, full_tank: true }),
    exp({ vehicle_id: 'f1', expense_date: '2026-10-04', category: 'servis', amount: 20000, odometer: 4330, note: 'Servis' }),
    exp({ vehicle_id: 'f1', expense_date: '2026-10-05', category: 'gorivo', amount: 12000, odometer: 4340.7, liters: 60, full_tank: true }),
  ]

  it('sati se čitaju sa jednom decimalom, kilometri su celi brojevi', () => {
    expect(parseMeter('4321,5', 'h')).toBe(4321.5)
    expect(parseMeter('4.321,5', 'h')).toBe(4321.5)
    expect(parseMeter('4321,54', 'h')).toBe(4321.5)
    expect(parseMeter('4321,56', 'h')).toBe(4321.6)
    expect(parseMeter('4321', 'h')).toBe(4321)
    expect(parseMeter('123.456', 'km')).toBe(123456)
    expect(parseMeter('12,5', 'km')).toBeNull() // kilometri nemaju decimale
    expect(parseMeter('', 'h')).toBeNull()
    expect(parseMeter('abc', 'h')).toBeNull()
  })

  it('prikaz: "4.321,5 h" i "123.456 km"', () => {
    expect(formatMeter(4321.5, 'h')).toBe('4.321,5 h')
    expect(formatMeter(4321, 'h')).toBe('4.321,0 h')
    expect(formatMeter(250, 'h', true)).toBe('250 h')
    expect(formatMeter(49.7, 'h', true)).toBe('49,7 h')
    expect(formatMeter(123456, 'km')).toBe('123.456 km')
    expect(meterName('h')).toBe('Radni sati')
    expect(meterName('km')).toBe('Kilometraža')
  })

  it('odrađeni sati od početnih sati, bez plutajuće greške', () => {
    expect(usageForPeriod(forklift, list, periodRange('mesec', NOW))!.used).toBe(140.7) // 4340,7 - 4200
    // bez početnih sati: 4340,7 - 4300 (u binarnom zapisu 40.69999999999982)
    expect(usageForPeriod({ initial_odometer: 0 }, list, periodRange('mesec', NOW))!.used).toBe(40.7)
  })

  it('potrošnja u litrima po satu (metoda punog rezervoara)', () => {
    const f = fuelStats(list)!
    expect(f.usage).toBe(40.7)
    expect(f.liters).toBe(120) // 15 + 45 + 60 (prvo punjenje se ne računa)
    expect(f.perUnit).toBeCloseTo(120 / 40.7, 10) // 2,95 L/h
    expect(f.per100).toBeCloseTo((120 / 40.7) * 100, 8)
  })

  it('cena po satu i sati mesečno', () => {
    const s = summarize(forklift, list, 'mesec', { includeAmort: false, now: NOW })
    expect(s.expensesTotal).toBe(52000)
    expect(s.usage).toBe(140.7) // od početnih 4.200 h (tada je rezervoar bio pun)
    expect(s.costPerUnit).toBeCloseTo(52000 / 140.7, 8)
    expect(s.months).toBe(1)
    expect(s.usagePerMonth).toBeCloseTo(140.7, 10)
    // potrošnja: i prvo punjenje (40 L na 100 h) ulazi u obračun
    expect(s.fuel!.liters).toBe(160)
    expect(s.fuel!.usage).toBe(140.7)
  })

  it('prosečno korišćenje se računa po mesecima obuhvaćenim periodom', () => {
    const older = [
      exp({ vehicle_id: 'f1', expense_date: '2026-08-10', category: 'gorivo', amount: 5000, odometer: 4250, liters: 30, full_tank: true }),
      ...list,
    ]
    const s = summarize(forklift, older, 'sve', { includeAmort: false, now: NOW })
    expect(s.usage).toBe(140.7) // 4340,7 - 4200 (početni sati)
    expect(s.months).toBe(3) // avgust, septembar, oktobar
    expect(s.usagePerMonth).toBeCloseTo(140.7 / 3, 10)
  })

  it('poslednja vrednost brojača uzima u obzir početne sate', () => {
    expect(latestOdometer(forklift, [])).toBe(4200)
    expect(latestOdometer(forklift, list)).toBe(4340.7)
  })

  it('servis na svakih 250 radnih sati: upozorenje 50 sati pre roka', () => {
    const r: Reminder = {
      id: 'h1', vehicle_id: 'f1', type: 'servis', title: 'Servis 250 h', due_date: null,
      interval_meter: 250, interval_months: null, last_date: null, last_meter: 4200,
    }
    const ev = (hours: number) => evaluateReminder(r, hours, NOW, 'h')
    expect(ev(4300).status).toBe('ok')
    expect(ev(4399).status).toBe('ok') // još 51 sat
    expect(ev(4400).status).toBe('soon') // tačno 50 sati do roka
    expect(ev(4400.3).meterLeft).toBe(49.7)
    expect(ev(4451).status).toBe('overdue')
    expect(ev(4400).parts[0]).toBe('Za 50 h (na 4.450 h)')
    expect(ev(4451).parts[0]).toBe('Prekoračeno za 1 h (rok 4.450 h)')
    // isti brojevi kod vozila na kilometre bi već bili "uskoro" (prag je 1.000 km)
    expect(evaluateReminder(r, 4399, NOW, 'km').status).toBe('soon')
  })

  it('upozorenja za sva vozila koriste jedinicu svakog vozila', () => {
    const r: Reminder = {
      id: 'h1', vehicle_id: 'f1', type: 'servis', title: 'Servis 250 h', due_date: null,
      interval_meter: 250, interval_months: null, last_date: null, last_meter: 4200,
    }
    expect(collectAlerts([r], [forklift], { f1: 4399 }, NOW)).toHaveLength(0)
    expect(collectAlerts([r], [{ ...forklift, meter_unit: 'km' }], { f1: 4399 }, NOW)).toHaveLength(1)
  })

  it('"urađeno" za servis upisuje trenutne sate', () => {
    const r: Reminder = {
      id: 'h1', vehicle_id: 'f1', type: 'servis', title: 'Servis 250 h', due_date: null,
      interval_meter: 250, interval_months: null, last_date: null, last_meter: 4200,
    }
    expect(markDone(r, 4440.7, '2026-10-05').last_meter).toBe(4440.7)
  })

  it('CSV: naslov kolone i broj decimala zavise od brojača', () => {
    const csv = buildCsv(list, forklift).split('\r\n')
    expect(csv[0]).toContain(';Radni sati;')
    expect(csv[1]).toContain(';4300,0;')
    expect(csv[2]).toContain(';4310,5;')
    expect(buildCsv([exp({ odometer: 100500 })], vehicle).split('\r\n')[0]).toContain(';Kilometraža;')
  })
})

describe('delovi aplikacije: Vozila (km) i Radne mašine (sati)', () => {
  const car: Vehicle = { ...vehicle, id: 'c', meter_unit: 'km' }
  const lift: Vehicle = { ...vehicle, id: 'f', name: 'Viljuškar', meter_unit: 'h' }

  it('deo zavisi samo od brojača', () => {
    expect(sectionOf('km')).toBe('vozila')
    expect(sectionOf('h')).toBe('masine')
    expect(unitOfSection('vozila')).toBe('km')
    expect(unitOfSection('masine')).toBe('h')
  })

  it('svaki deo vidi samo svoja vozila', () => {
    const all = [car, lift, { ...car, id: 'c2' }]
    expect(vehiclesIn(all, 'vozila').map((v) => v.id)).toEqual(['c', 'c2'])
    expect(vehiclesIn(all, 'masine').map((v) => v.id)).toEqual(['f'])
    expect(vehiclesIn([], 'masine')).toEqual([])
  })

  it('mašine nemaju putarinu, parking i kazne; vozila imaju sve vrste', () => {
    const ids = CATEGORIES.map((c) => c.id)
    expect(categoriesFor('vozila', ids)).toEqual(ids)
    const m = categoriesFor('masine', ids)
    for (const hidden of ['putarina', 'parking', 'kazne']) expect(m).not.toContain(hidden)
    for (const kept of ['gorivo', 'servis', 'gume', 'tehnicki', 'registracija', 'osiguranje', 'pranje', 'vanredni', 'ostalo']) {
      expect(m).toContain(kept)
    }
  })

  it('tahograf se nudi samo za vozila', () => {
    expect(reminderTypesFor('vozila')).toEqual(['tehnicki', 'registracija', 'tahograf', 'servis', 'ostalo'])
    expect(reminderTypesFor('masine')).not.toContain('tahograf')
    expect(reminderTypesFor('masine')).toContain('servis')
  })

  it('natpisi: kilometri za vozila, sati za mašine', () => {
    expect(SECTION_COPY.vozila.costUnit).toBe('RSD/km')
    expect(SECTION_COPY.masine.costUnit).toBe('RSD/h')
    expect(SECTION_COPY.masine.initialMeter).toMatch(/sati/)
    expect(consumptionUnit('km', 'L')).toBe('L/100 km')
    expect(consumptionUnit('h', 'L')).toBe('L/h')
    expect(consumptionUnit('h', 'kWh')).toBe('kWh/h')
  })
})

describe('cena goriva i obračun iznosa', () => {
  const prices: FuelPrice[] = [
    { id: 'p1', fuel_type: 'Dizel', valid_from: '2026-09-28', price: 188 },
    { id: 'p2', fuel_type: 'Dizel', valid_from: '2026-10-05', price: 190 },
    { id: 'p3', fuel_type: 'Dizel', valid_from: '2026-10-12', price: 195.5 },
    { id: 'p4', fuel_type: 'TNG', valid_from: '2026-10-05', price: 98 },
  ]

  it('važi poslednja cena čiji je datum "važi od" jednak ili raniji od dana sipanja', () => {
    expect(priceFor(prices, 'Dizel', '2026-10-09')?.price).toBe(190)
    expect(priceFor(prices, 'Dizel', '2026-10-12')?.price).toBe(195.5) // tog dana već važi nova cena
    expect(priceFor(prices, 'Dizel', '2026-10-11')?.price).toBe(190) // dan pre
    expect(priceFor(prices, 'Dizel', '2026-12-31')?.price).toBe(195.5) // važi dok se ne upiše nova
  })

  it('pre prve upisane cene i za drugu vrstu goriva nema cene', () => {
    expect(priceFor(prices, 'Dizel', '2026-09-27')).toBeNull()
    expect(priceFor(prices, 'Benzin', '2026-10-09')).toBeNull()
    expect(priceFor(prices, 'TNG', '2026-10-04')).toBeNull()
    expect(priceFor([], 'Dizel', '2026-10-09')).toBeNull()
  })

  it('sipanje bez iznosa dobija iznos: litri x cena, zaokruženo na pare', () => {
    const list = [
      fill(1000, 40, true, { expense_date: '2026-10-09', amount: null }), // 40 x 190
      fill(1500, 40, true, { expense_date: '2026-10-14', amount: null }), // 40 x 195,5
      fill(1800, 33.33, true, { expense_date: '2026-10-14', amount: null }), // 33,33 x 195,5 = 6516,015
    ]
    const out = applyFuelPrices(list, 'Dizel', prices)
    expect(out.map((e) => e.amount)).toEqual([7600, 7820, 6516.02])
    expect(out[0].calc).toEqual({ price: 190, from: '2026-10-05' })
    expect(out[1].calc).toEqual({ price: 195.5, from: '2026-10-12' })
  })

  it('upisan iznos ima prednost i ne dira se', () => {
    const list = [fill(1000, 40, true, { expense_date: '2026-10-09', amount: 7000 })]
    const out = applyFuelPrices(list, 'Dizel', prices)
    expect(out[0].amount).toBe(7000)
    expect(out[0].calc).toBeUndefined()
  })

  it('ostaje prazno kad nema cene za taj dan, kad nema litara i za ostale vrste troškova', () => {
    const list = [
      fill(1000, 40, true, { expense_date: '2026-09-01', amount: null }), // pre prve cene
      exp({ category: 'gorivo', odometer: 1100, liters: null, full_tank: true, amount: null, expense_date: '2026-10-09' }),
      exp({ category: 'putarina', amount: null, expense_date: '2026-10-09' }),
    ]
    const out = applyFuelPrices(list, 'Dizel', prices)
    expect(out.map((e) => e.amount)).toEqual([null, null, null])
    expect(out.every((e) => !e.calc)).toBe(true)
  })

  it('ne menja ulaznu listu, a bez cena vraća istu listu', () => {
    const list = [fill(1000, 40, true, { expense_date: '2026-10-09', amount: null })]
    const out = applyFuelPrices(list, 'Dizel', prices)
    expect(list[0].amount).toBeNull()
    expect(out).not.toBe(list)
    expect(applyFuelPrices(list, 'Dizel', [])).toBe(list)
  })

  it('obračunati iznosi ulaze u zbir, cenu po km i mesečni prosek; "bez iznosa" ostaje samo ono što se ne može obračunati', () => {
    const list = [
      fill(100000, 50, true, { expense_date: '2026-10-02', amount: null }), // važi cena od 28.9: 50 x 188 = 9400
      fill(100500, 40, true, { expense_date: '2026-10-05', amount: null }), // 40 x 190 = 7600
      exp({ expense_date: '2026-10-04', category: 'putarina', amount: null }), // nema cene za putarinu
    ]
    const s = summarize(vehicle, applyFuelPrices(list, 'Dizel', prices), 'mesec', { includeAmort: false, now: NOW })
    expect(s.expensesTotal).toBe(17000) // 9400 + 7600
    expect(s.pending).toBe(1) // samo putarina
    expect(s.usage).toBe(500)
    expect(s.costPerUnit).toBeCloseTo(17000 / 500, 10)
    expect(monthlySeries(applyFuelPrices(list, 'Dizel', prices), NOW)[11].fuel).toBe(17000)
  })

  it('cena po litru za prikaz: obračunata cena, ili iznos / količina', () => {
    const calc = applyFuelPrices([fill(1000, 40, true, { expense_date: '2026-10-09', amount: null })], 'Dizel', prices)[0]
    expect(unitPrice(calc)).toBe(190)
    expect(unitPrice(fill(1000, 40, true, { amount: 7500 }))).toBe(187.5)
    expect(unitPrice(fill(1000, 40, true, { amount: null }))).toBeNull()
    expect(unitPrice(exp({ category: 'putarina', amount: 500 }))).toBeNull()
  })

  it('CSV: dodatne kolone sa cenom po litru i oznakom obračuna', () => {
    const list = applyFuelPrices(
      [fill(1000, 40, true, { expense_date: '2026-10-09', amount: null }), fill(1500, 40, true, { expense_date: '2026-10-10', amount: 7500 })],
      'Dizel', prices,
    )
    const lines = buildCsv(list, vehicle).split('\r\n')
    expect(lines[1]).toBe('09.10.2026;Golf;BG-123-AA;Gorivo;7600,00;1000;40,00;Da;;;190,00;Da')
    expect(lines[2]).toBe('10.10.2026;Golf;BG-123-AA;Gorivo;7500,00;1500;40,00;Da;;;187,50;')
    const electric = buildCsv([], { ...vehicle, fuel_type: 'Električno' }).split('\r\n')[0]
    expect(electric).toContain('Cena po kWh (RSD)')
  })

  it('nedelja počinje ponedeljkom', () => {
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05') // ponedeljak
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05') // sreda
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05') // nedelja
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12')
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29') // prelazak u prethodnu godinu
  })
})
