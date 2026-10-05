import { useEffect, useRef } from 'react'

/** Poziva onIdle kad korisnik duže od `minutes` ništa ne dodirne (zaštita ako telefon ostane otključan). */
export function useIdleLogout(minutes: number, onIdle: () => void): void {
  const cb = useRef(onIdle)
  cb.current = onIdle
  useEffect(() => {
    let timer = window.setTimeout(() => cb.current(), minutes * 60_000)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => cb.current(), minutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [minutes])
}
