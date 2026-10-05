// Srpski format brojeva i datuma: 1.234,56 i 05.10.2026.

export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '–'
  const fixed = Math.abs(n).toFixed(decimals)
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : ''
  return sign + grouped + (frac ? ',' + frac : '')
}

export const formatRSD = (n: number, decimals = 2): string => `${formatNumber(n, decimals)} RSD`
export const formatKm = (n: number): string => `${formatNumber(n, 0)} km`

/** "1.234,56", "1234.56", "1234,56", "12,5" -> broj; prazno ili neispravno -> null. */
export function parseDecimal(input: string): number | null {
  let s = input.trim().replace(/\s/g, '')
  if (s === '') return null
  if (!/^[0-9.,]+$/.test(s)) return null
  if (s.includes(',')) {
    // zarez je decimalni, tačke su hiljade
    if (s.indexOf(',') !== s.lastIndexOf(',')) return null
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '') // 1.234 -> 1234 (srpski zapis hiljada)
  } else if ((s.match(/\./g) ?? []).length > 1) {
    return null
  }
  if (s.startsWith('.') && s.length === 1) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Ceo broj (kilometraža): "123.456", "123 456", "123456". */
export function parseInteger(input: string): number | null {
  const n = parseDecimal(input)
  if (n === null || !Number.isInteger(n)) return null
  return n
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Lokalni datum kao YYYY-MM-DD (ne UTC, da "danas" bude tačno posle ponoći). */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function formatDate(iso: string | null | undefined, trailingDot = true): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}${trailingDot ? '.' : ''}`
}

export const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']
export const MONTHS_LONG = [
  'januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar',
]

/** Srpska množina: 1 dan, 2 dana, 5 dana, 21 dan, 12 dana. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

export const formatDays = (n: number): string => `${formatNumber(n, 0)} ${plural(n, 'dan', 'dana', 'dana')}`
export const formatMonths = (n: number): string => `${formatNumber(n, 0)} ${plural(n, 'mesec', 'meseca', 'meseci')}`
