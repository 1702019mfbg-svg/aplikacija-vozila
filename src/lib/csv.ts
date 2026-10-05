import { formatDate } from './format'
import { categoryLabel, type Expense, type Vehicle } from './types'

// CSV za Excel na srpskom: separator ";", decimalni zarez, UTF-8 sa BOM.

const HEADER = ['Datum', 'Vozilo', 'Registracija', 'Vrsta', 'Iznos (RSD)', 'Kilometraža', 'Litara', 'Pun rezervoar', 'Napomena', 'Uneo']

/** Tekst koji počinje sa = + - @ Excel bi izvršio kao formulu; dodajemo apostrof ispred. */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function cell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const num = (n: number | null, decimals: number): string => (n === null ? '' : n.toFixed(decimals).replace('.', ','))

export function buildCsv(expenses: Expense[], vehicle: Vehicle): string {
  const sorted = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at))
  const rows = sorted.map((e) =>
    [
      formatDate(e.expense_date, false),
      safeText(vehicle.name),
      safeText(vehicle.plate ?? ''),
      categoryLabel(e.category),
      num(e.amount, 2),
      num(e.odometer, 0),
      num(e.liters, 2),
      e.category === 'gorivo' ? (e.full_tank ? 'Da' : 'Ne') : '',
      safeText((e.note ?? '').replace(/\s+/g, ' ').trim()),
      safeText(e.driver_name ?? ''),
    ].map(cell),
  )
  const lines = [HEADER.map(cell), ...rows].map((r) => r.join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function csvFilename(vehicle: Vehicle, now = new Date()): string {
  const slug = vehicle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vozilo'
  return `troskovi-${slug}-${now.toISOString().slice(0, 10)}.csv`
}
