import type { Category, MeterUnit, ReminderType, Vehicle } from './types'

/**
 * Aplikacija ima dva dela: "Vozila" (sve u kilometrima) i "Radne mašine" (sve u radnim satima).
 * Deo zavisi samo od brojača vozila: km -> Vozila, h -> Radne mašine.
 */
export type Section = 'vozila' | 'masine'
export const SECTIONS: Section[] = ['vozila', 'masine']

export const sectionOf = (unit: MeterUnit): Section => (unit === 'h' ? 'masine' : 'vozila')
export const unitOfSection = (section: Section): MeterUnit => (section === 'masine' ? 'h' : 'km')
export const vehiclesIn = <T extends { meter_unit: MeterUnit }>(list: T[], section: Section): T[] =>
  list.filter((v) => sectionOf(v.meter_unit) === section)

/** Tekstovi koji se razlikuju između delova. */
export interface SectionCopy {
  label: string // naziv dela (prekidač)
  manage: string // naziv taba za upravljanje
  one: string // "vozilo" / "mašina"
  select: string // oznaka izbora
  add: string // dugme za dodavanje
  added: string // poruka posle dodavanja
  newTitle: string
  editTitle: string
  empty: string // kad nema nijedne stavke
  emptyHint: string
  namePlaceholder: string
  plateLabel: string
  initialMeter: string // početna kilometraža / početni radni sati
  costTitle: string // naslov glavnog broja na pregledu
  costUnit: string // RSD/km ili RSD/h
  usageTitle: string // Pređeno / Radni sati
  consumptionTitle: string // Potrošnja (L/100 km) / (L/h)
  usageHint: string // zašto nema broja
  deleteWarning: string
}

export const SECTION_COPY: Record<Section, SectionCopy> = {
  vozila: {
    label: 'Vozila',
    manage: 'Vozila',
    one: 'vozilo',
    select: 'Vozilo',
    add: 'Dodaj vozilo',
    added: 'Vozilo je dodato.',
    newTitle: 'Novo vozilo',
    editTitle: 'Izmena vozila',
    empty: 'Još nema nijednog vozila',
    emptyHint: 'Dodajte prvo vozilo da biste počeli da pratite troškove.',
    namePlaceholder: 'npr. Mercedes Sprinter',
    plateLabel: 'Registarska oznaka',
    initialMeter: 'Početna kilometraža',
    costTitle: 'Cena po kilometru',
    costUnit: 'RSD/km',
    usageTitle: 'Pređeno',
    consumptionTitle: 'Potrošnja',
    usageHint: 'Potrebna su bar dva unosa sa kilometražom u izabranom periodu.',
    deleteWarning: 'Obrisati vozilo i SVE njegove troškove i podsetnike? Ovo se ne može poništiti.',
  },
  masine: {
    label: 'Radne mašine',
    manage: 'Mašine',
    one: 'mašina',
    select: 'Mašina',
    add: 'Dodaj mašinu',
    added: 'Mašina je dodata.',
    newTitle: 'Nova mašina',
    editTitle: 'Izmena mašine',
    empty: 'Još nema nijedne radne mašine',
    emptyHint: 'Dodajte prvu mašinu (npr. viljuškar) da biste počeli da pratite potrošnju i troškove po radnom satu.',
    namePlaceholder: 'npr. Viljuškar Linde H25',
    plateLabel: 'Oznaka / inventarski broj',
    initialMeter: 'Početni radni sati',
    costTitle: 'Cena po radnom satu',
    costUnit: 'RSD/h',
    usageTitle: 'Radni sati',
    consumptionTitle: 'Potrošnja',
    usageHint: 'Potrebna su bar dva unosa sa radnim satima u izabranom periodu.',
    deleteWarning: 'Obrisati mašinu i SVE njene troškove i podsetnike? Ovo se ne može poništiti.',
  },
}

/** Vrste troškova koje imaju smisla u datom delu (putarina, parking i kazne nisu za mašine). */
export function categoriesFor(section: Section, all: readonly Category[]): Category[] {
  const hidden: Category[] = section === 'masine' ? ['putarina', 'parking', 'kazne'] : []
  return all.filter((c) => !hidden.includes(c))
}

/** Podsetnici koji se nude pri dodavanju (tahograf je samo za vozila). */
export function reminderTypesFor(section: Section): ReminderType[] {
  return section === 'masine' ? ['servis', 'registracija', 'tehnicki', 'ostalo'] : ['tehnicki', 'registracija', 'tahograf', 'servis', 'ostalo']
}

/** Natpis za potrošnju: "L/100 km" za vozila, "L/h" za mašine (kWh za električne). */
export function consumptionUnit(unit: MeterUnit, fuelUnit: string): string {
  return unit === 'h' ? `${fuelUnit}/h` : `${fuelUnit}/100 km`
}

export const vehicleTitle = (v: Pick<Vehicle, 'name' | 'plate'>): string => (v.plate ? `${v.name} · ${v.plate}` : v.name)
