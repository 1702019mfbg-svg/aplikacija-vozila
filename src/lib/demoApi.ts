// DEMO režim: sve je u memoriji, bez Supabase-a. Služi samo za razvoj i probu izgleda.
// Ne ulazi u produkcioni build (uključuje se samo sa VITE_DEMO=1).
import { addDays, addMonths } from './dates'
import { todayISO } from './format'
import { ApiError, driverError, type Api, type DriverEntry, type OwnerUser, type VehicleInput } from './api'
import type {
  Category, Driver, DriverSession, Expense, ExpenseInput, Reminder, ReminderInput, Vehicle,
} from './types'

interface DemoDriver extends Driver {
  pin: string
  failed: number
  lockedUntil: number
}

const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms))
let counter = 0
const uid = (prefix: string) => `${prefix}-${++counter}-${Math.random().toString(36).slice(2, 8)}`

function seed() {
  const today = todayISO()
  let state = 20260105
  const rnd = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)]

  const vehicles: Vehicle[] = [
    {
      id: 'v-sprinter', name: 'Mercedes Sprinter', plate: 'BG 123-AB', fuel_type: 'Dizel', meter_unit: 'km', initial_odometer: 212000,
      purchase_date: addMonths(today, -26), purchase_price: 4_800_000, amort_years: 8,
    },
    {
      id: 'v-octavia', name: 'Škoda Octavia', plate: 'NS 456-CD', fuel_type: 'Benzin', meter_unit: 'km', initial_odometer: 86000,
      purchase_date: null, purchase_price: null, amort_years: null,
    },
    {
      id: 'v-linde', name: 'Viljuškar Linde H25', plate: 'VŠ-01', fuel_type: 'TNG', meter_unit: 'h', initial_odometer: 4200,
      purchase_date: addMonths(today, -30), purchase_price: 2_900_000, amort_years: 10,
    },
    {
      id: 'v-toyota', name: 'Viljuškar Toyota 8FD', plate: 'VŠ-02', fuel_type: 'Dizel', meter_unit: 'h', initial_odometer: 7800,
      purchase_date: null, purchase_price: null, amort_years: null,
    },
  ]

  const expenses: Expense[] = []
  const add = (vehicle_id: string, daysAgo: number, p: Partial<Expense> & { category: Category }) => {
    const n = expenses.length
    expenses.push({
      id: `e-${n}`, vehicle_id, expense_date: addDays(today, -daysAgo), amount: null, odometer: null, liters: null,
      full_tank: null, note: null, driver_id: null, driver_name: null,
      created_at: `${addDays(today, -daysAgo)}T12:00:${String(n % 60).padStart(2, '0')}Z`, ...p,
    })
  }

  // Goriva: svakih ~10 dana, sa potrošnjom koja se računa metodom punog rezervoara
  const fuelRun = (
    id: string, startOdo: number, per100: number, kmPerDay: number, pricePerL: number, days: number, driver: string | null,
    opts: { gap?: [number, number]; decimals?: number; driverId?: string } = {},
  ) => {
    const { gap: gapRange = [7, 12], decimals = 0, driverId = 'dr-marko' } = opts
    const factor = 10 ** decimals
    let odo = startOdo
    let owed = 0
    for (let d = days; d > 0; ) {
      const gap = Math.round(between(gapRange[0], gapRange[1]))
      d -= gap
      if (d < 0) break
      const km = gap * kmPerDay * between(0.8, 1.2)
      odo += km
      owed += (km * per100 * between(0.95, 1.05)) / 100
      const partial = rnd() < 0.12
      const liters = Math.round((partial ? owed * 0.5 : owed) * 100) / 100
      owed -= liters
      const price = pricePerL * between(0.97, 1.03)
      add(id, d, {
        category: 'gorivo', liters, full_tank: !partial, odometer: Math.round(odo * factor) / factor, amount: Math.round(liters * price),
        driver_id: driver && d < 120 ? driverId : null, driver_name: driver && d < 120 ? driver : null,
      })
    }
    return Math.round(odo * factor) / factor
  }
  const sprinterOdo = fuelRun('v-sprinter', 212000, 11.6, 190, 188, 460, 'Marko')
  const octaviaOdo = fuelRun('v-octavia', 86000, 7.4, 55, 196, 460, null)
  // Radne mašine: brojač su radni sati (jedna decimala), potrošnja u litrima po satu
  const lindeHours = fuelRun('v-linde', 4200, 310, 5.2, 96, 460, 'Petar', { gap: [3, 6], decimals: 1, driverId: 'dr-petar' })
  const toyotaHours = fuelRun('v-toyota', 7800, 260, 3.8, 188, 460, null, { gap: [5, 9], decimals: 1 })

  // Putarine, pranje
  for (let m = 0; m < 15; m++) {
    for (let i = 0; i < 3; i++) {
      const daysAgo = m * 30 + Math.round(between(1, 28))
      const byDriver = daysAgo < 120
      add('v-sprinter', daysAgo, {
        category: 'putarina', amount: pick([180, 250, 420, 640, 1180, 1470]),
        driver_id: byDriver ? 'dr-marko' : null, driver_name: byDriver ? 'Marko' : null,
      })
    }
    add('v-sprinter', m * 30 + Math.round(between(2, 27)), { category: 'pranje', amount: pick([1000, 1200, 1500]), driver_id: m < 4 ? 'dr-marko' : null, driver_name: m < 4 ? 'Marko' : null })
    if (m % 2 === 0) add('v-octavia', m * 30 + Math.round(between(2, 27)), { category: 'pranje', amount: pick([700, 900]) })
    if (m % 3 === 0) add('v-octavia', m * 30 + Math.round(between(2, 27)), { category: 'putarina', amount: pick([250, 420]) })
  }

  // Servisi, registracija, tehnički pregled, osiguranje, vanredni
  add('v-sprinter', 160, { category: 'servis', amount: 46500, odometer: sprinterOdo - 29000, note: 'Veliki servis, ulje i filteri' })
  add('v-sprinter', 35, { category: 'servis', amount: 24500, odometer: sprinterOdo - 5200, note: 'Kočione pločice napred' })
  add('v-sprinter', 300, { category: 'gume', amount: 96000, note: 'Komplet zimskih guma' })
  add('v-sprinter', 20, { category: 'tehnicki', amount: 11900, note: null, driver_id: 'dr-marko', driver_name: 'Marko' })
  add('v-sprinter', 200, { category: 'tehnicki', amount: 11900 })
  add('v-sprinter', 175, { category: 'registracija', amount: 28400 })
  add('v-sprinter', 250, { category: 'osiguranje', amount: 94000 })
  add('v-sprinter', 90, { category: 'vanredni', amount: 18000, note: 'Odvlačenje vozila posle kvara', odometer: sprinterOdo - 12000 })
  add('v-sprinter', 12, { category: 'kazne', amount: 6000, note: 'Parking kazna' })
  add('v-sprinter', 6, { category: 'ostalo', amount: null, note: 'Sijalica i osigurač', driver_id: 'dr-marko', driver_name: 'Marko' })
  add('v-sprinter', 3, { category: 'parking', amount: null, driver_id: 'dr-marko', driver_name: 'Marko' })
  add('v-sprinter', 1, { category: 'putarina', amount: null, driver_id: 'dr-marko', driver_name: 'Marko' })
  add('v-linde', 150, { category: 'servis', amount: 38000, odometer: lindeHours - 215, note: 'Servis 500 h: ulje, filteri, hidraulika' })
  add('v-linde', 260, { category: 'gume', amount: 84000, note: 'Komplet guma, prednje i zadnje' })
  add('v-linde', 70, { category: 'vanredni', amount: 14500, note: 'Hidraulično crevo (kvar na stubu)', odometer: lindeHours - 90 })
  add('v-linde', 200, { category: 'tehnicki', amount: 9500, note: 'Periodični pregled i ispitivanje' })
  add('v-linde', 4, { category: 'ostalo', amount: null, note: 'Sijalica i osigurač', driver_id: 'dr-petar', driver_name: 'Petar Jovanović' })
  add('v-linde', 2, { category: 'servis', amount: null, note: 'Zamena viljuški', driver_id: 'dr-petar', driver_name: 'Petar Jovanović' })
  add('v-toyota', 120, { category: 'servis', amount: 26500, odometer: toyotaHours - 120, note: 'Servis 250 h' })
  add('v-toyota', 340, { category: 'osiguranje', amount: 12800 })
  add('v-octavia', 140, { category: 'servis', amount: 22000, odometer: octaviaOdo - 5400, note: 'Mali servis' })
  add('v-octavia', 330, { category: 'registracija', amount: 14900 })
  add('v-octavia', 330, { category: 'tehnicki', amount: 6400 })
  add('v-octavia', 250, { category: 'osiguranje', amount: 41000 })

  const R = (id: string, vehicle_id: string, type: Reminder['type'], title: string, p: Partial<Reminder>): Reminder => ({
    id, vehicle_id, type, title, due_date: null, interval_months: null, interval_meter: null, last_date: null, last_meter: null, ...p,
  })
  const reminders: Reminder[] = [
    R('r1', 'v-sprinter', 'tehnicki', 'Tehnički pregled', { due_date: addDays(today, 12), interval_months: 6 }),
    R('r2', 'v-sprinter', 'registracija', 'Registracija', { due_date: addDays(today, 200), interval_months: 12 }),
    R('r3', 'v-sprinter', 'tahograf', 'Tahograf – istek overe', { due_date: addDays(today, 24), interval_months: 24 }),
    R('r4', 'v-sprinter', 'servis', 'Veliki servis', { interval_meter: 30000, last_meter: sprinterOdo - 29200 }),
    R('r5', 'v-octavia', 'registracija', 'Registracija', { due_date: addDays(today, -3), interval_months: 12 }),
    R('r6', 'v-octavia', 'servis', 'Mali servis', { interval_months: 12, interval_meter: 15000, last_date: addMonths(today, -5), last_meter: octaviaOdo - 5400 }),
    R('r7', 'v-linde', 'servis', 'Servis na 250 radnih sati', { interval_meter: 250, last_meter: Math.round((lindeHours - 215) * 10) / 10 }),
    R('r8', 'v-linde', 'ostalo', 'Periodični pregled i ispitivanje', { due_date: addDays(today, 80), interval_months: 12 }),
    R('r9', 'v-toyota', 'servis', 'Servis na 250 radnih sati', { interval_meter: 250, last_meter: Math.round((toyotaHours - 120) * 10) / 10 }),
  ]

  const drivers: DemoDriver[] = [
    { id: 'dr-marko', name: 'Marko Petrović', code: 'A1B2C3D4E5', active: true, vehicle_ids: ['v-sprinter'], pin: '1234', failed: 0, lockedUntil: 0 },
    { id: 'dr-jovana', name: 'Jovana Ilić', code: 'F0E1D2C3B4', active: true, vehicle_ids: ['v-sprinter', 'v-octavia', 'v-linde'], pin: '5678', failed: 0, lockedUntil: 0 },
    { id: 'dr-petar', name: 'Petar Jovanović', code: 'C0FFEE1234', active: true, vehicle_ids: ['v-linde', 'v-toyota'], pin: '4321', failed: 0, lockedUntil: 0 },
  ]
  // ime vozača u unosima: puno ime
  for (const e of expenses) {
    if (e.driver_name === 'Marko') e.driver_name = 'Marko Petrović'
    if (e.driver_name === 'Petar') e.driver_name = 'Petar Jovanović'
  }

  return { vehicles, expenses, reminders, drivers }
}

export function createDemoApi(): Api {
  const db = seed()
  let signedIn = false
  const listeners = new Set<(u: OwnerUser | null) => void>()
  const user: OwnerUser = { id: 'demo-owner', email: 'demo@vozila.rs' }
  const emit = () => listeners.forEach((cb) => cb(signedIn ? user : null))

  const lastOdo = (vehicleId: string): number => {
    const v = db.vehicles.find((x) => x.id === vehicleId)
    return db.expenses.reduce((m, e) => (e.vehicle_id === vehicleId && e.odometer !== null && e.odometer > m ? e.odometer : m), v?.initial_odometer ?? 0)
  }

  const normalize = (code: string) => code.replace(/[^0-9a-z]/gi, '').toUpperCase()
  function authDriver(code: string, pin: string): DemoDriver {
    const d = db.drivers.find((x) => normalize(x.code) === normalize(code) && x.active)
    if (!d) throw driverError('invalid')
    if (d.lockedUntil > Date.now()) throw driverError('locked')
    if (d.pin !== pin) {
      d.failed += 1
      if (d.failed >= 5) {
        d.failed = 0
        d.lockedUntil = Date.now() + 15 * 60 * 1000
        throw driverError('locked')
      }
      throw driverError('invalid')
    }
    d.failed = 0
    return d
  }

  return {
    kind: 'demo',
    owner: {
      async getUser() { await delay(); return signedIn ? user : null },
      onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
      async signIn(email, password) {
        await delay()
        if (!email.trim() || !password) throw new ApiError('login', 'Pogrešan email ili lozinka.')
        signedIn = true
        emit()
      },
      async signOut() { await delay(); signedIn = false; emit() },
      async changePassword() { await delay() },

      async listVehicles() { await delay(); return structuredClone(db.vehicles) },
      async odometers() { await delay(); return Object.fromEntries(db.vehicles.map((v) => [v.id, lastOdo(v.id)])) },
      async saveVehicle(input: VehicleInput, id?: string) {
        await delay()
        if (id) {
          const v = db.vehicles.find((x) => x.id === id)
          if (!v) throw new ApiError('not_found', 'Stavka nije pronađena.')
          Object.assign(v, input)
          return structuredClone(v)
        }
        const v: Vehicle = { id: uid('v'), ...input }
        db.vehicles.push(v)
        return structuredClone(v)
      },
      async deleteVehicle(id) {
        await delay()
        db.vehicles = db.vehicles.filter((v) => v.id !== id)
        db.expenses = db.expenses.filter((e) => e.vehicle_id !== id)
        db.reminders = db.reminders.filter((r) => r.vehicle_id !== id)
        for (const d of db.drivers) d.vehicle_ids = d.vehicle_ids.filter((x) => x !== id)
      },

      async listExpenses(vehicleId) {
        await delay()
        return structuredClone(db.expenses.filter((e) => e.vehicle_id === vehicleId))
          .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at))
      },
      async saveExpense(input: ExpenseInput, id?: string) {
        await delay()
        if (id) {
          const e = db.expenses.find((x) => x.id === id)
          if (!e) throw new ApiError('not_found', 'Stavka nije pronađena.')
          const { vehicle_id: _v, ...editable } = input
          Object.assign(e, editable)
          return structuredClone(e)
        }
        const e: Expense = { id: uid('e'), driver_id: null, driver_name: null, created_at: new Date().toISOString(), ...input }
        db.expenses.push(e)
        return structuredClone(e)
      },
      async deleteExpense(id) { await delay(); db.expenses = db.expenses.filter((e) => e.id !== id) },

      async listDrivers() {
        await delay()
        return db.drivers.map(({ pin: _p, failed: _f, lockedUntil: _l, ...d }) => structuredClone(d))
      },
      async createDriver(name, pin, vehicleIds) {
        await delay()
        const code = Array.from({ length: 10 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
        const d: DemoDriver = { id: uid('dr'), name, code, active: true, vehicle_ids: vehicleIds, pin, failed: 0, lockedUntil: 0 }
        db.drivers.push(d)
        return { id: d.id, code }
      },
      async updateDriver(id, patch) {
        await delay()
        const d = db.drivers.find((x) => x.id === id)
        if (!d) throw new ApiError('not_found', 'Stavka nije pronađena.')
        d.name = patch.name
        d.active = patch.active
        d.vehicle_ids = patch.vehicleIds
      },
      async setDriverPin(id, pin, newCode) {
        await delay()
        const d = db.drivers.find((x) => x.id === id)
        if (!d) throw new ApiError('not_found', 'Stavka nije pronađena.')
        d.pin = pin
        d.failed = 0
        d.lockedUntil = 0
        if (newCode) d.code = Array.from({ length: 10 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('')
        return { code: d.code }
      },
      async deleteDriver(id) { await delay(); db.drivers = db.drivers.filter((d) => d.id !== id) },

      async listReminders() { await delay(); return structuredClone(db.reminders) },
      async saveReminder(input: ReminderInput, id?: string) {
        await delay()
        if (id) {
          const r = db.reminders.find((x) => x.id === id)
          if (!r) throw new ApiError('not_found', 'Stavka nije pronađena.')
          Object.assign(r, input)
          return structuredClone(r)
        }
        const r: Reminder = { id: uid('r'), ...input }
        db.reminders.push(r)
        return structuredClone(r)
      },
      async deleteReminder(id) { await delay(); db.reminders = db.reminders.filter((r) => r.id !== id) },
    },

    driver: {
      async login({ code, pin }): Promise<DriverSession> {
        await delay()
        const d = authDriver(code, pin)
        return {
          name: d.name,
          vehicles: db.vehicles
            .filter((v) => d.vehicle_ids.includes(v.id))
            .map((v) => ({ id: v.id, name: v.name, plate: v.plate, fuel_type: v.fuel_type, meter_unit: v.meter_unit, last_odometer: lastOdo(v.id) })),
        }
      },
      async addExpense({ code, pin }, e: DriverEntry) {
        await delay()
        const d = authDriver(code, pin)
        if (!d.vehicle_ids.includes(e.vehicle_id)) throw driverError('bad_vehicle')
        const today = todayISO()
        if (e.expense_date > addDays(today, 1) || e.expense_date < addDays(today, -14)) throw driverError('bad_date')
        if (e.amount !== null && (e.amount < 0 || e.amount > 99_999_999)) throw driverError('bad_amount')
        const note = e.note?.trim() || null
        if ((e.category === 'ostalo' || e.category === 'vanredni') && !note) throw driverError('note_required')
        if (e.category === 'gorivo') {
          if (e.liters === null || e.liters <= 0 || e.liters > 2000) throw driverError('bad_liters')
          if (e.odometer === null) throw driverError('odometer_required')
        }
        if (e.odometer !== null) {
          const last = lastOdo(e.vehicle_id)
          if (e.odometer < last) throw driverError('odometer_low', { last_odometer: last })
        }
        if (db.expenses.some((x) => x.id === e.id)) return // ponovljeno slanje
        db.expenses.push({
          id: e.id, vehicle_id: e.vehicle_id, expense_date: e.expense_date, category: e.category, amount: e.amount,
          odometer: e.odometer, liters: e.category === 'gorivo' ? e.liters : null,
          full_tank: e.category === 'gorivo' ? e.full_tank : null, note, driver_id: d.id, driver_name: d.name,
          created_at: new Date().toISOString(),
        })
      },
    },
  }
}
