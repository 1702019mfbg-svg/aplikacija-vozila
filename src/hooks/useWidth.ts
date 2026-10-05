import { useEffect, useState } from 'react'

/**
 * Prati širinu elementa (za grafikon koji crta u stvarnoj veličini, da tekst ostane čitljiv).
 * Vraća "callback ref": radi i kad se element pojavi tek posle prvog prikaza (npr. posle učitavanja podataka).
 */
export function useWidth<T extends HTMLElement>(initial = 640): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width) || initial)
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, initial])
  return [setEl, width]
}
