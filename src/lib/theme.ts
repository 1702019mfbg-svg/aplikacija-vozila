import { useEffect, useState } from 'react'
import { storage } from './storage'

export type ThemeChoice = 'auto' | 'light' | 'dark'
const KEY = 'tema'

function read(): ThemeChoice {
  const v = storage.get(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

function apply(choice: ThemeChoice): void {
  const el = document.documentElement
  if (choice === 'auto') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', choice)
}

/** Postavlja temu pri pokretanju, pre prikaza (da ne trepne pogrešna). */
export function initTheme(): void {
  apply(read())
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(read)
  useEffect(() => apply(choice), [choice])
  return [
    choice,
    (c) => {
      storage.set(KEY, c)
      setChoice(c)
    },
  ]
}

export const THEME_LABELS: Record<ThemeChoice, string> = { auto: 'Automatski', light: 'Svetli', dark: 'Tamni' }
