export const FUEL_TYPES = ['Dizel', 'Benzin', 'TNG', 'Električno'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const CATEGORIES = [
  { id: 'gorivo', label: 'Gorivo' },
  { id: 'servis', label: 'Servis i delovi' },
  { id: 'gume', label: 'Gume' },
  { id: 'registracija', label: 'Registracija' },
  { id: 'tehnicki', label: 'Tehnički pregled' },
  { id: 'osiguranje', label: 'Osiguranje' },
  { id: 'putarina', label: 'Putarina' },
  { id: 'parking', label: 'Parking' },
  { id: 'pranje', label: 'Pranje vozila' },
  { id: 'kazne', label: 'Kazne' },
  { id: 'vanredni', label: 'Vanredni trošak' },
  { id: 'ostalo', label: 'Ostalo' },
] as const
export type Category = (typeof CATEGORIES)[number]['id']

/** Vozač sme da unese sve vrste troškova; najčešće su prve. */
export const DRIVER_CATEGORIES: Category[] = [
  'gorivo', 'putarina', 'servis', 'vanredni', 'ostalo', 'parking', 'pranje', 'tehnicki', 'registracija', 'gume', 'kazne', 'osiguranje',
]

/** Vrste za koje opis (napomena) nije opcion. */
export const NOTE_REQUIRED: Category[] = ['ostalo', 'vanredni']

export const categoryLabel = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id

export interface Vehicle {
  id: string
  name: string
  plate: string | null
  fuel_type: FuelType
  initial_odometer: number
  purchase_date: string | null
  purchase_price: number | null
  amort_years: number | null
}

export interface Expense {
  id: string
  vehicle_id: string
  expense_date: string // YYYY-MM-DD
  category: Category
  amount: number | null // null = iznos još nije upisan
  odometer: number | null
  liters: number | null
  full_tank: boolean | null
  note: string | null
  driver_id: string | null
  driver_name: string | null
  created_at: string
}

export type ExpenseInput = Pick<
  Expense,
  'vehicle_id' | 'expense_date' | 'category' | 'amount' | 'odometer' | 'liters' | 'full_tank' | 'note'
>

export interface Driver {
  id: string
  name: string
  code: string
  active: boolean
  vehicle_ids: string[]
}

/** Tip podsetnika: 'servis' se računa od poslednjeg servisa, svi ostali imaju datum isteka. */
export type ReminderType = 'tehnicki' | 'registracija' | 'tahograf' | 'servis' | 'ostalo'

export interface Reminder {
  id: string
  vehicle_id: string
  type: ReminderType
  title: string
  due_date: string | null // datum isteka (svi tipovi osim servisa)
  interval_km: number | null // servis: na svakih X km
  interval_months: number | null // servis: na svakih X meseci; ostali: na koliko meseci se obnavlja
  last_date: string | null // servis: kad je poslednji put urađen
  last_km: number | null
  warn_days: number // koliko dana unapred upozoriti
  warn_km: number // koliko km unapred upozoriti (servis)
}

export type ReminderInput = Omit<Reminder, 'id'>

/** Šta vozač dobija pri prijavi: samo ime i svoja vozila. */
export interface DriverSession {
  name: string
  vehicles: DriverVehicle[]
}
export interface DriverVehicle {
  id: string
  name: string
  plate: string | null
  fuel_type: FuelType
  last_odometer: number
}

export const unitFor = (fuel: FuelType): string => (fuel === 'Električno' ? 'kWh' : 'L')
