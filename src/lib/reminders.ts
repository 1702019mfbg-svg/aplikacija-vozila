import { addMonths, diffDays } from './dates'
import { formatDate, formatDays, formatKm, formatNumber, todayISO } from './format'
import type { Reminder, ReminderInput, ReminderType, Vehicle } from './types'

export type ReminderStatus = 'ok' | 'soon' | 'overdue'

/** Gotovi šabloni za najčešće obaveze. Sve vrednosti se mogu izmeniti pri dodavanju. */
export interface ReminderPreset {
  type: ReminderType
  label: string
  title: string
  hint: string
  /** Na koliko meseci se obnavlja (koristi dugme "Urađeno"). */
  interval_months: number | null
  warn_days: number
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { type: 'tehnicki', label: 'Tehnički pregled', title: 'Tehnički pregled', hint: 'Na svakih 6 meseci', interval_months: 6, warn_days: 30 },
  { type: 'registracija', label: 'Registracija', title: 'Registracija', hint: 'Datum isteka registracije', interval_months: 12, warn_days: 30 },
  { type: 'tahograf', label: 'Tahograf', title: 'Tahograf – istek overe', hint: 'Datum isteka overe tahografa', interval_months: 24, warn_days: 60 },
  { type: 'servis', label: 'Servis', title: 'Servis', hint: 'Na svakih X km ili X meseci', interval_months: null, warn_days: 30 },
  { type: 'ostalo', label: 'Drugo', title: '', hint: 'Bilo koji datum isteka', interval_months: null, warn_days: 30 },
]

export const presetFor = (type: ReminderType): ReminderPreset => REMINDER_PRESETS.find((p) => p.type === type) as ReminderPreset

/** Servis se računa od poslednjeg servisa (km / meseci); ostali tipovi imaju datum isteka. */
export const isIntervalReminder = (r: Pick<Reminder, 'type'>): boolean => r.type === 'servis'

export const DEFAULT_WARN_DAYS = 30
export const DEFAULT_WARN_KM = 1000
/** Ako obnavljanje nije zadato: na koliko meseci se pomera rok kad se označi "Urađeno". */
const FALLBACK_RENEW_MONTHS = 12

export interface ReminderState {
  status: ReminderStatus
  dueDate: string | null
  daysLeft: number | null
  dueKm: number | null
  kmLeft: number | null
  parts: string[] // opis roka, spreman za prikaz
}

export function evaluateReminder(r: Reminder, currentKm: number, now = new Date()): ReminderState {
  const today = todayISO(now)
  let dueDate: string | null = null
  let dueKm: number | null = null

  if (isIntervalReminder(r)) {
    if (r.interval_months && r.last_date) dueDate = addMonths(r.last_date, r.interval_months)
    if (r.interval_km && r.last_km !== null) dueKm = r.last_km + r.interval_km
  } else {
    dueDate = r.due_date
  }

  const daysLeft = dueDate ? diffDays(dueDate, today) : null
  const kmLeft = dueKm !== null ? dueKm - currentKm : null

  const parts: string[] = []
  if (daysLeft !== null && dueDate) {
    if (daysLeft < 0) parts.push(`Isteklo pre ${formatDays(-daysLeft)} (${formatDate(dueDate)})`)
    else if (daysLeft === 0) parts.push(`Ističe danas (${formatDate(dueDate)})`)
    else parts.push(`Za ${formatDays(daysLeft)} (${formatDate(dueDate)})`)
  }
  if (kmLeft !== null && dueKm !== null) {
    if (kmLeft < 0) parts.push(`Prekoračeno za ${formatKm(-kmLeft)} (rok ${formatKm(dueKm)})`)
    else parts.push(`Za ${formatNumber(kmLeft, 0)} km (na ${formatKm(dueKm)})`)
  }
  if (parts.length === 0) parts.push('Upišite poslednji servis da bi se rok izračunao')

  const warnDays = r.warn_days ?? DEFAULT_WARN_DAYS
  const warnKm = r.warn_km ?? DEFAULT_WARN_KM
  let status: ReminderStatus = 'ok'
  if ((daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0)) status = 'overdue'
  else if ((daysLeft !== null && daysLeft <= warnDays) || (kmLeft !== null && kmLeft <= warnKm)) status = 'soon'

  return { status, dueDate, daysLeft, dueKm, kmLeft, parts }
}

const SEVERITY: Record<ReminderStatus, number> = { overdue: 0, soon: 1, ok: 2 }

/** Najhitnije prvo: isteklo, pa uskoro, pa ostalo; unutar grupe po preostalim danima. */
export function sortByUrgency<T extends { state: ReminderState }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY[a.state.status] - SEVERITY[b.state.status] ||
      (a.state.daysLeft ?? Infinity) - (b.state.daysLeft ?? Infinity) ||
      (a.state.kmLeft ?? Infinity) - (b.state.kmLeft ?? Infinity),
  )
}

/**
 * Novi datum isteka kad je obaveza urađena na dan `doneOn`.
 * Ako je urađeno pre isteka, rok se računa od starog isteka (ne gubi se preostalo vreme);
 * ako je zakasnilo, računa se od dana kad je urađeno.
 */
export function nextDueDate(r: Reminder, doneOn: string): string {
  const base = r.due_date && r.due_date > doneOn ? r.due_date : doneOn
  return addMonths(base, r.interval_months ?? FALLBACK_RENEW_MONTHS)
}

/** Predlog novih vrednosti kad se obaveza uradi: datum isteka se pomera, servis kreće od `doneOn` i tekuće kilometraže. */
export function markDone(r: Reminder, currentKm: number, doneOn: string): ReminderInput {
  const { id: _id, ...rest } = r
  if (isIntervalReminder(r)) {
    return {
      ...rest,
      last_date: r.interval_months ? doneOn : r.last_date,
      last_km: r.interval_km ? currentKm : r.last_km,
    }
  }
  return { ...rest, due_date: nextDueDate(r, doneOn) }
}

export interface Alert {
  reminder: Reminder
  vehicle: Vehicle
  state: ReminderState
}

/** Svi podsetnici svih vozila kojima je rok blizu ili je istekao, najhitniji prvo. */
export function collectAlerts(
  reminders: Reminder[],
  vehicles: Vehicle[],
  odometers: Record<string, number>,
  now = new Date(),
): Alert[] {
  const byId = new Map(vehicles.map((v) => [v.id, v]))
  const alerts: Alert[] = []
  for (const reminder of reminders) {
    const vehicle = byId.get(reminder.vehicle_id)
    if (!vehicle) continue
    const state = evaluateReminder(reminder, odometers[vehicle.id] ?? vehicle.initial_odometer, now)
    if (state.status !== 'ok') alerts.push({ reminder, vehicle, state })
  }
  return sortByUrgency(alerts)
}
