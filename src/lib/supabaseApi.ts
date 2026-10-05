import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError, driverError, type Api, type DriverEntry, type OwnerUser, type VehicleInput } from './api'
import { config } from './config'
import type { Driver, DriverSession, DriverVehicle, Expense, ExpenseInput, Reminder, ReminderInput, Vehicle } from './types'

type PgError = { message?: string; code?: string; details?: string }

/** Pretvara tehničku grešku (Supabase/Postgres) u poruku na srpskom. */
function translate(error: PgError): ApiError {
  const msg = error.message ?? ''
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) {
    return new ApiError('network', 'Nema veze sa serverom. Proverite internet i pokušajte ponovo.')
  }
  if (/invalid login credentials/i.test(msg)) return new ApiError('login', 'Pogrešan email ili lozinka.')
  if (/email not confirmed/i.test(msg)) {
    return new ApiError('login', 'Email adresa nije potvrđena. U Supabase-u otvorite Authentication → Users i potvrdite je.')
  }
  if (/jwt expired|not_authenticated|invalid jwt|auth session missing/i.test(msg)) {
    return new ApiError('auth', 'Prijava je istekla. Prijavite se ponovo.')
  }
  if (/too many requests|rate limit/i.test(msg)) {
    return new ApiError('rate', 'Previše pokušaja. Sačekajte malo i pokušajte ponovo.')
  }
  if (msg.includes('bad_pin')) return new ApiError('bad_pin', 'PIN mora imati od 4 do 8 cifara.')
  if (msg.includes('bad_name')) return new ApiError('bad_name', 'Ime nije ispravno.')
  if (msg.includes('bad_vehicle')) return new ApiError('bad_vehicle', 'Izabrano vozilo nije ispravno.')
  if (msg.includes('not_found')) return new ApiError('not_found', 'Stavka nije pronađena.')
  if (/expenses_note_required/.test(msg)) return new ApiError('note_required', 'Za "Ostalo" i "Vanredni trošak" upišite opis.')
  if (/expenses_fuel_only/.test(msg)) return new ApiError('fuel_only', 'Litri se upisuju samo za gorivo.')
  if (/row-level security|permission denied/i.test(msg)) return new ApiError('denied', 'Nemate dozvolu za ovu radnju.')
  if (/schema cache|does not exist|could not find the/i.test(msg) || error.code === '42P01' || error.code === 'PGRST202') {
    return new ApiError('setup', 'Baza nije podešena do kraja. Pokrenite fajl supabase/schema.sql u Supabase-u (uputstvo, korak 3).')
  }
  console.error(error)
  return new ApiError('unknown', 'Došlo je do greške. Pokušajte ponovo.')
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

const toVehicle = (r: any): Vehicle => ({
  id: r.id,
  name: r.name,
  plate: r.plate,
  fuel_type: r.fuel_type,
  meter_unit: r.meter_unit,
  initial_odometer: Number(r.initial_odometer),
  purchase_date: r.purchase_date,
  purchase_price: num(r.purchase_price),
  amort_years: num(r.amort_years),
})

const toExpense = (r: any): Expense => ({
  id: r.id,
  vehicle_id: r.vehicle_id,
  expense_date: r.expense_date,
  category: r.category,
  amount: num(r.amount),
  odometer: num(r.odometer),
  liters: num(r.liters),
  full_tank: r.full_tank,
  note: r.note,
  driver_id: r.driver_id,
  driver_name: r.driver_name,
  created_at: r.created_at,
})

const toReminder = (r: any): Reminder => ({
  id: r.id,
  vehicle_id: r.vehicle_id,
  type: r.type,
  title: r.title,
  due_date: r.due_date,
  interval_meter: num(r.interval_meter),
  interval_months: num(r.interval_months),
  last_date: r.last_date,
  last_meter: num(r.last_meter),
})

function check<T>(res: { data: T | null; error: PgError | null }): T {
  if (res.error) throw translate(res.error)
  return res.data as T
}

function failOnError(res: { error: PgError | null }): void {
  if (res.error) throw translate(res.error)
}

const PAGE = 1000 // Supabase vraća najviše 1000 redova odjednom, pa čitamo u stranicama

export function createSupabaseApi(): Api {
  const client: SupabaseClient = createClient(config.supabaseUrl as string, config.supabaseKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

  const toUser = (session: { user: { id: string; email?: string } } | null): OwnerUser | null =>
    session ? { id: session.user.id, email: session.user.email ?? '' } : null

  return {
    kind: 'supabase',

    owner: {
      async getUser() {
        const { data, error } = await client.auth.getSession()
        if (error) throw translate(error)
        return toUser(data.session)
      },
      onAuthChange(cb) {
        const { data } = client.auth.onAuthStateChange((_event, session) => cb(toUser(session)))
        return () => data.subscription.unsubscribe()
      },
      async signIn(email, password) {
        failOnError(await client.auth.signInWithPassword({ email: email.trim(), password }))
      },
      async signOut() {
        failOnError(await client.auth.signOut())
      },
      async changePassword(password) {
        failOnError(await client.auth.updateUser({ password }))
      },

      async listVehicles() {
        const rows = check(await client.from('vehicles').select('*').order('created_at'))
        return rows.map(toVehicle)
      },
      async odometers() {
        const rows = check(await client.from('vehicle_status').select('vehicle_id,last_odometer'))
        return Object.fromEntries(rows.map((r: any) => [r.vehicle_id, Number(r.last_odometer)]))
      },
      async saveVehicle(input: VehicleInput, id?: string) {
        const q = id ? client.from('vehicles').update(input).eq('id', id) : client.from('vehicles').insert(input)
        return toVehicle(check(await q.select().single()))
      },
      async deleteVehicle(id) {
        failOnError(await client.from('vehicles').delete().eq('id', id))
      },

      async listExpenses(vehicleId) {
        const all: Expense[] = []
        for (let from = 0; ; from += PAGE) {
          const rows = check(
            await client
              .from('expenses')
              .select('*')
              .eq('vehicle_id', vehicleId)
              .order('expense_date', { ascending: false })
              .order('created_at', { ascending: false })
              .order('id')
              .range(from, from + PAGE - 1),
          )
          all.push(...rows.map(toExpense))
          if (rows.length < PAGE) break
        }
        return all
      },
      async saveExpense(input: ExpenseInput, id?: string) {
        if (id) {
          const { vehicle_id: _vehicle, ...editable } = input // vozilo se ne menja
          return toExpense(check(await client.from('expenses').update(editable).eq('id', id).select().single()))
        }
        return toExpense(check(await client.from('expenses').insert(input).select().single()))
      },
      async deleteExpense(id) {
        failOnError(await client.from('expenses').delete().eq('id', id))
      },

      async listDrivers() {
        const rows = check(
          await client.from('drivers').select('id,name,code,active,driver_vehicles(vehicle_id)').order('name'),
        )
        return rows.map(
          (r: any): Driver => ({
            id: r.id,
            name: r.name,
            code: r.code,
            active: r.active,
            vehicle_ids: (r.driver_vehicles ?? []).map((x: any) => x.vehicle_id),
          }),
        )
      },
      async createDriver(name, pin, vehicleIds) {
        return check(await client.rpc('create_driver', { p_name: name, p_pin: pin, p_vehicle_ids: vehicleIds })) as {
          id: string
          code: string
        }
      },
      async updateDriver(id, patch) {
        failOnError(await client.from('drivers').update({ name: patch.name, active: patch.active }).eq('id', id))
        failOnError(await client.rpc('set_driver_vehicles', { p_driver_id: id, p_vehicle_ids: patch.vehicleIds }))
      },
      async setDriverPin(id, pin, newCode) {
        return check(await client.rpc('set_driver_pin', { p_driver_id: id, p_pin: pin, p_new_code: newCode })) as {
          code: string
        }
      },
      async deleteDriver(id) {
        failOnError(await client.from('drivers').delete().eq('id', id))
      },

      async listReminders() {
        const rows = check(await client.from('reminders').select('*').order('created_at'))
        return rows.map(toReminder)
      },
      async saveReminder(input: ReminderInput, id?: string) {
        const q = id ? client.from('reminders').update(input).eq('id', id) : client.from('reminders').insert(input)
        return toReminder(check(await q.select().single()))
      },
      async deleteReminder(id) {
        failOnError(await client.from('reminders').delete().eq('id', id))
      },
    },

    driver: {
      async login({ code, pin }): Promise<DriverSession> {
        const { data, error } = await client.rpc('driver_login', { p_code: code, p_pin: pin })
        if (error) throw translate(error)
        const r = data as { ok: boolean; error?: string; name?: string; vehicles?: DriverVehicle[] }
        if (!r.ok) throw driverError(r.error)
        return {
          name: r.name as string,
          vehicles: (r.vehicles ?? []).map((v) => ({ ...v, last_odometer: Number(v.last_odometer) })),
        }
      },
      async addExpense({ code, pin }, e: DriverEntry) {
        const { data, error } = await client.rpc('driver_add_expense', {
          p_code: code,
          p_pin: pin,
          p_id: e.id,
          p_vehicle_id: e.vehicle_id,
          p_date: e.expense_date,
          p_category: e.category,
          p_amount: e.amount,
          p_odometer: e.odometer,
          p_liters: e.liters,
          p_full_tank: e.full_tank,
          p_note: e.note,
        })
        if (error) throw translate(error)
        const r = data as { ok: boolean; error?: string; last_odometer?: number }
        if (!r.ok) throw driverError(r.error, { last_odometer: r.last_odometer })
      },
    },
  }
}
