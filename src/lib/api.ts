import type {
  Category, Driver, DriverSession, Expense, ExpenseInput, FuelType, MeterUnit, Reminder, ReminderInput, Vehicle,
} from './types'

/** Greška sa kodom i porukom na srpskom, spremnom za prikaz korisniku. */
export class ApiError extends Error {
  code: string
  extra: Record<string, unknown>
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.code = code
    this.extra = extra
  }
}

export interface VehicleInput {
  name: string
  plate: string | null
  fuel_type: FuelType
  meter_unit: MeterUnit
  initial_odometer: number
  purchase_date: string | null
  purchase_price: number | null
  amort_years: number | null
}

export interface OwnerUser {
  id: string
  email: string
}

/** Kod vozača + PIN. Čuvaju se samo u memoriji dok je vozač prijavljen. */
export interface DriverCreds {
  code: string
  pin: string
}

/** Jedan unos vozača. Id pravi aplikacija, pa ponovljeno slanje ne pravi duplikat. */
export interface DriverEntry {
  id: string
  vehicle_id: string
  expense_date: string
  category: Category
  amount: number | null
  odometer: number | null
  liters: number | null
  full_tank: boolean
  note: string | null
}

export interface OwnerApi {
  getUser(): Promise<OwnerUser | null>
  onAuthChange(cb: (user: OwnerUser | null) => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  changePassword(password: string): Promise<void>

  listVehicles(): Promise<Vehicle[]>
  /** Poslednja poznata kilometraža svih vozila (za upozorenja o servisu). */
  odometers(): Promise<Record<string, number>>
  saveVehicle(input: VehicleInput, id?: string): Promise<Vehicle>
  deleteVehicle(id: string): Promise<void>

  listExpenses(vehicleId: string): Promise<Expense[]>
  saveExpense(input: ExpenseInput, id?: string): Promise<Expense>
  deleteExpense(id: string): Promise<void>

  listDrivers(): Promise<Driver[]>
  createDriver(name: string, pin: string, vehicleIds: string[]): Promise<{ id: string; code: string }>
  updateDriver(id: string, patch: { name: string; active: boolean; vehicleIds: string[] }): Promise<void>
  setDriverPin(id: string, pin: string, newCode: boolean): Promise<{ code: string }>
  deleteDriver(id: string): Promise<void>

  listReminders(): Promise<Reminder[]>
  saveReminder(input: ReminderInput, id?: string): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
}

/** Vozač nema nalog: ima samo ove dve radnje. Ne može da pročita nijedan podatak. */
export interface DriverApi {
  login(creds: DriverCreds): Promise<DriverSession>
  addExpense(creds: DriverCreds, entry: DriverEntry): Promise<void>
}

export interface Api {
  kind: 'supabase' | 'demo'
  owner: OwnerApi
  driver: DriverApi
}

let current: Api | null = null
export function setApi(api: Api): void {
  current = api
}
export function getApi(): Api {
  if (!current) throw new Error('API nije pokrenut')
  return current
}

const DRIVER_MESSAGES: Record<string, string> = {
  invalid: 'Pogrešan kod ili PIN.',
  locked: 'Previše pogrešnih pokušaja. Pokušajte ponovo za 15 minuta ili pozovite vlasnika.',
  bad_vehicle: 'Ovo vozilo vam nije dodeljeno.',
  bad_category: 'Vrsta troška nije ispravna.',
  bad_date: 'Datum mora biti u poslednjih 14 dana.',
  bad_amount: 'Iznos nije ispravan.',
  bad_note: 'Napomena je predugačka (najviše 500 znakova).',
  note_required: 'Upišite šta je u pitanju.',
  bad_liters: 'Upišite broj litara.',
  odometer_required: 'Upišite kilometražu.',
  bad_odometer: 'Kilometraža nije ispravna.',
}

/** Pretvara kod greške iz funkcija za vozača u poruku na srpskom. */
export function driverError(code: string | undefined, extra: Record<string, unknown> = {}): ApiError {
  const c = code ?? 'unknown'
  if (c === 'odometer_low') {
    const last = Number(extra.last_odometer)
    return new ApiError(c, `Kilometraža ne može biti manja od poslednje upisane${Number.isFinite(last) ? ` (${last.toLocaleString('sr-Latn-RS')} km)` : ''}.`, extra)
  }
  return new ApiError(c, DRIVER_MESSAGES[c] ?? 'Došlo je do greške. Pokušajte ponovo.', extra)
}

/** Tekst greške za prikaz, bez tehničkih detalja. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message
  console.error(e)
  return 'Došlo je do greške. Pokušajte ponovo.'
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'network'
}
