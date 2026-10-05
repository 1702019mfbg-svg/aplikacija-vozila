// Računanje sa datumima zapisanim kao "YYYY-MM-DD" (bez vremenskih zona).

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** Redni broj dana (UTC), za razliku između datuma bez problema sa letnjim računanjem vremena. */
export function dayNumber(iso: string): number {
  const { y, m, d } = parseISO(iso)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

export const diffDays = (a: string, b: string): number => dayNumber(a) - dayNumber(b)

export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Dodaje mesece; 31. januar + 1 mesec = 28/29. februar. */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseISO(iso)
  const idx = y * 12 + (m - 1) + months
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

export const addYears = (iso: string, years: number): string => addMonths(iso, years * 12)

export const monthKey = (iso: string): string => iso.slice(0, 7)

/** Indeks meseca (godina*12 + mesec) za poređenje i razliku u mesecima. */
export function monthIndex(iso: string): number {
  const { y, m } = parseISO(iso)
  return y * 12 + (m - 1)
}
