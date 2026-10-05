import { describe, expect, it } from 'vitest'
import {
  amortization, byCategory, filterByRange, fuelStats, kmDriven, latestOdometer, monthlySeries, monthsSpanned,
  periodRange, sumAmount, summarize,
} from '../src/lib/calc'
import { buildCsv, csvFilename } from '../src/lib/csv'
import { addMonths, diffDays } from '../src/lib/dates'
import { formatDate, formatNumber, formatRSD, parseDecimal, parseInteger, plural, todayISO } from '../src/lib/format'
import { REMINDER_PRESETS, collectAlerts, evaluateReminder, markDone, nextDueDate, presetFor, sortByUrgency } from '../src/lib/reminders'
import type { Expense, Reminder, Vehicle } from '../src/lib/types'

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
  id: 'v1', name: 'Golf', plate: 'BG-123-AA', fuel_type: 'Dizel', initial_odometer: 100000,
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
  it('najveća minus najmanja upisana kilometraža', () => {
    expect(kmDriven([exp({ odometer: 1000 }), exp({ odometer: 1500 }), exp({ odometer: 1200 }), exp({})])).toBe(500)
  })
  it('bez dva različita očitavanja nema odgovora', () => {
    expect(kmDriven([])).toBeNull()
    expect(kmDriven([exp({ odometer: 1000 })])).toBeNull()
    expect(kmDriven([exp({ odometer: 1000 }), exp({ odometer: 1000 })])).toBeNull()
  })
})

describe('potrošnja metodom punog rezervoara', () => {
  it('litri posle prvog punog do poslednjeg punog, podeljeno sa km', () => {
    // puno 10000 (baza), delimično 10300 (20 L), puno 10600 (30 L), puno 11000 (35 L)
    // litri = 20 + 30 + 35 = 85, km = 1000 -> 8,5 L/100 km
    const list = [fill(11000, 35, true), fill(10000, 40, true), fill(10600, 30, true), fill(10300, 20, false)]
    const s = fuelStats(list)!
    expect(s.liters).toBe(85)
    expect(s.km).toBe(1000)
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
    expect(s.km).toBe(500)
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

  it('cena po km = zbir u periodu / (najveća - najmanja kilometraža u periodu)', () => {
    const s = summarize(vehicle, list, 'mesec', { includeAmort: false, now: NOW })
    expect(s.count).toBe(4)
    expect(s.expensesTotal).toBe(13000) // 8000 + 500 + 4500, unos bez iznosa se ne računa
    expect(s.pending).toBe(1)
    expect(s.km).toBe(500) // 100500 - 100000 (očitavanje iz septembra ne ulazi)
    expect(s.costPerKm).toBeCloseTo(26, 10)
    expect(s.months).toBe(1)
    expect(s.monthlyAvg).toBe(13000)
  })

  it('period "Sve" obuhvata i starije unose, a prosek je po mesecima od prvog unosa', () => {
    const s = summarize(vehicle, list, 'sve', { includeAmort: false, now: NOW })
    expect(s.expensesTotal).toBe(33000)
    expect(s.km).toBe(1500) // 100500 - 99000
    expect(s.costPerKm).toBeCloseTo(22, 10)
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
    expect(on.costPerKm!).toBeGreaterThan(off.costPerKm!)
    expect(on.costPerKm).toBeCloseTo(on.total / 500, 10)
  })

  it('bez dovoljno kilometraže nema cene po km', () => {
    const s = summarize(vehicle, [exp({ amount: 100 })], 'mesec', { includeAmort: false, now: NOW })
    expect(s.costPerKm).toBeNull()
    expect(s.km).toBeNull()
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
    interval_km: null, interval_months: null, last_date: null, last_km: null, warn_days: 30, warn_km: 1000,
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

  it('svaki podsetnik ima svoj rok upozorenja (tahograf 60 dana unapred)', () => {
    const tahograf: Reminder = { ...base, type: 'tahograf', title: 'Tahograf', due_date: '2026-12-01', warn_days: 60 } // za 57 dana
    expect(evaluateReminder(tahograf, 0, NOW).status).toBe('soon')
    expect(evaluateReminder({ ...tahograf, warn_days: 30 }, 0, NOW).status).toBe('ok')
    expect(evaluateReminder({ ...tahograf, due_date: '2026-12-04' }, 0, NOW).status).toBe('soon') // tačno 60 dana: granica je uključena
    expect(evaluateReminder({ ...tahograf, due_date: '2026-12-05' }, 0, NOW).status).toBe('ok') // 61 dan
  })

  it('servis na svakih X km', () => {
    const r = servis({ interval_km: 10000, last_km: 100000 })
    expect(evaluateReminder(r, 105000, NOW).status).toBe('ok')
    expect(evaluateReminder(r, 109000, NOW).status).toBe('soon') // tačno 1000 km do roka
    expect(evaluateReminder(r, 108999, NOW).status).toBe('ok')
    expect(evaluateReminder(r, 109500, NOW).kmLeft).toBe(500)
    expect(evaluateReminder(r, 110001, NOW).status).toBe('overdue')
    expect(evaluateReminder(r, 110300, NOW).parts[0]).toBe('Prekoračeno za 300 km (rok 110.000 km)')
    expect(evaluateReminder({ ...r, warn_km: 3000 }, 107500, NOW).status).toBe('soon')
  })

  it('servis na svakih X meseci', () => {
    const st = evaluateReminder(servis({ interval_months: 12, last_date: '2025-10-20' }), 0, NOW)
    expect(st.dueDate).toBe('2026-10-20')
    expect(st.status).toBe('soon')
  })

  it('kad su zadata oba, važi lošiji', () => {
    const r = servis({ interval_km: 10000, last_km: 100000, interval_months: 12, last_date: '2026-09-01' })
    expect(evaluateReminder(r, 111000, NOW).status).toBe('overdue') // km prekoračen, datum je daleko
    expect(evaluateReminder(r, 100000, NOW).status).toBe('ok')
  })

  it('servis bez poslednjeg servisa ne puca', () => {
    const st = evaluateReminder(servis({ interval_km: 10000 }), 5000, NOW)
    expect(st.status).toBe('ok')
    expect(st.parts[0]).toMatch(/Upišite poslednji servis/)
  })

  it('šabloni: tehnički na 6 meseci, registracija na 12, tahograf na 24', () => {
    const m = (t: string) => presetFor(t as any)
    expect([m('tehnicki').interval_months, m('registracija').interval_months, m('tahograf').interval_months]).toEqual([6, 12, 24])
    expect(m('tahograf').warn_days).toBeGreaterThan(m('tehnicki').warn_days)
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
    const serv = servis({ interval_km: 10000, interval_months: 12, last_date: '2025-01-01', last_km: 90000 })
    const done = markDone(serv, 101500, '2026-10-05')
    expect(done.last_date).toBe('2026-10-05')
    expect(done.last_km).toBe(101500)
    // servis samo na km ne dira datum
    const kmOnly = markDone(servis({ interval_km: 10000, last_date: '2025-01-01', last_km: 90000 }), 101500, '2026-10-05')
    expect(kmOnly.last_date).toBe('2025-01-01')
    expect(kmOnly.last_km).toBe(101500)
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
      { ...base, id: 'c', vehicle_id: 'v2', type: 'tahograf', title: 'Tahograf', due_date: '2028-01-01', warn_days: 60 }, // daleko
      servis({ id: 'd', vehicle_id: 'v1', interval_km: 10000, last_km: 100000 }), // km: 105000 -> ok
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
    expect(csv.split('\r\n')[0]).toBe('﻿Datum;Vozilo;Registracija;Vrsta;Iznos (RSD);Kilometraža;Litara;Pun rezervoar;Napomena;Uneo')
  })

  it('decimalni zarez, redom po datumu, prazno polje za nepoznat iznos', () => {
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1].startsWith('01.10.2026;Golf;BG-123-AA;Ostalo;;;;;')).toBe(true)
    expect(lines[3]).toBe('05.10.2026;Golf;BG-123-AA;Gorivo;8123,50;100500;40,25;Da;;Marko')
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
