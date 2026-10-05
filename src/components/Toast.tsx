import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type Kind = 'ok' | 'error'
interface Item {
  id: number
  text: string
  kind: Kind
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {})
export const useToast = () => useContext(ToastContext)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const show = useCallback((text: string, kind: Kind = 'ok') => {
    const id = nextId++
    setItems((list) => [...list, { id, text, kind }])
    window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  const value = useMemo(() => show, [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast toast--${i.kind}`}>
            <Icon name={i.kind === 'ok' ? 'check' : 'warn'} size={18} />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
