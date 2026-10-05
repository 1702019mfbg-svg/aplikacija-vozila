import { addMonths, diffDays } from './dates'
import { formatDate, formatDays, formatMeter, todayISO } from './format'
import type { MeterUnit, Reminder, ReminderInput, ReminderType, Vehicle } from './types'

export type ReminderStatus = 'ok' | 'soon' | 'overdue'

/** Gotovi šabloni za najčešće obaveze. Sve vrednosti se mogu izmeniti pri dodavanju. */
export interface ReminderPreset {
  type: ReminderType
  label: string
  title: string
  hint: string
  /** Na koliko meseci se obnavlja (koristi dugme "Urađeno"). */
  interval_months: number | null
}

export const REMINDER_PRESETS: ReminderPreset[] = [
  { type: 'tehnicki', label: 'Tehnički pregled', title: 'Tehnički pregled', hint: 'Na svakih 6 meseci', interval_months: 6 },
  { type: 'registracija', label: 'Registracija', title: 'Registracija', hint: 'Datum isteka registracije', interval_months: 12 },
  { type: 'tahograf', label: 'Tahograf', title: 'Tahograf – istek overe', hint: 'Datum isteka overe tahografa', interval_months: 24 },
  { type: 'servis', label: 'Servis', title: 'Servis', hint: 'Na svakih X km (ili radnih sati) ili X meseci', interval_months: null },
  { type: 'ostalo', label: 'Drugo', title: '', hint: 'Bilo koji datum isteka', interval_months: null },
]

export const presetFor = (type: ReminderType): ReminderPreset => REMINDER_PRESETS.find((p) => p.type === type) as ReminderPreset

/** Servis se računa od poslednjeg servisa (km / meseci); ostali tipovi imaju datum isteka. */
export const isIntervalReminder = (r: Pick<Reminder, 'type'>): boolean => r.type === 'servis'

/**
 * Upozorenje se pojavljuje 30 dana pre isteka roka (za sve podsetnike).
 * Za servis po brojaču: 1.000 km pre roka, a kod mašina na radne sate 50 sati pre roka.
 */
export const WARN_DAYS = 30
export const WARN_METER: Record<MeterUnit, number> = { km: 1000, h: 50 }
/** Ako obnavljanje nije zadato: na koliko meseci se pomera rok kad se označi "Urađeno". */
const FALLBACK_RENEW_MONTHS = 12

export interface ReminderState {
  status: ReminderStatus
  dueDate: string | null
  daysLeft: number | null
  dueMeter: number | null
  meterLeft: number | null
  parts: string[] // opis roka, spreman za prikaz
}

export function evaluateReminder(r: Reminder, currentMeter: number, now = new Date(), unit: MeterUnit = 'km'): ReminderState {
  const today = todayISO(now)
  let dueDate: string | null = null
  let dueMeter: number | null = null

  if (isIntervalReminder(r)) {
    if (r.interval_months && r.last_date) dueDate = addMonths(r.last_date, r.interval_months)
    if (r.interval_meter && r.last_meter !== null) dueMeter = r.last_meter + r.interval_meter
  } else {
    dueDate = r.due_date
  }

  const daysLeft = dueDate ? diffDays(dueDate, today) : null
  const meterLeft = dueMeter !== null ? Math.round((dueMeter - currentMeter) * 10) / 10 : null

  const parts: string[] = []
  if (daysLeft !== null && dueDate) {
    if (daysLeft < 0) parts.push(`Isteklo pre ${formatDays(-daysLeft)} (${formatDate(dueDate)})`)
    else if (daysLeft === 0) parts.push(`Ističe danas (${formatDate(dueDate)})`)
    else parts.push(`Za ${formatDays(daysLeft)} (${formatDate(dueDate)})`)
  }
  if (meterLeft !== null && dueMeter !== null) {
    if (meterLeft < 0) parts.push(`Prekoračeno za ${formatMeter(-meterLeft, unit, true)} (rok ${formatMeter(dueMeter, unit, true)})`)
    else parts.push(`Za ${formatMeter(meterLeft, unit, true)} (na ${formatMeter(dueMeter, unit, true)})`)
  }
  if (parts.length === 0) parts.push('Upišite poslednji servis da bi se rok izračunao')

  let status: ReminderStatus = 'ok'
  if ((daysLeft !== null && daysLeft < 0) || (meterLeft !== null && meterLeft < 0)) status = 'overdue'
  else if ((daysLeft !== null && daysLeft <= WARN_DAYS) || (meterLeft !== null && meterLeft <= WARN_METER[unit])) status = 'soon'

  return { status, dueDate, daysLeft, dueMeter, meterLeft, parts }
}

const SEVERITY: Record<ReminderStatus, number> = { overdue: 0, soon: 1, ok: 2 }

/** Najhitnije prvo: isteklo, pa uskoro, pa ostalo; unutar grupe po preostalim danima. */
export function sortByUrgency<T extends { state: ReminderState }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY[a.state.status] - SEVERITY[b.state.status] ||
      (a.state.daysLeft ?? Infinity) - (b.state.daysLeft ?? Infinity) ||
      (a.state.meterLeft ?? Infinity) - (b.state.meterLeft ?? Infinity),
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
export function markDone(r: Reminder, currentMeter: number, doneOn: string): ReminderInput {
  const { id: _id, ...rest } = r
  if (isIntervalReminder(r)) {
    return {
      ...rest,
      last_date: r.interval_months ? doneOn : r.last_date,
      last_meter: r.interval_meter ? currentMeter : r.last_meter,
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
    const state = evaluateReminder(reminder, odometers[vehicle.id] ?? vehicle.initial_odometer, now, vehicle.meter_unit)
    if (state.status !== 'ok') alerts.push({ reminder, vehicle, state })
  }
  return sortByUrgency(alerts)
}
