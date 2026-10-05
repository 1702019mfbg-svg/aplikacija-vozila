import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText, getApi } from '../lib/api'
import type { Driver, Expense, Reminder, Vehicle } from '../lib/types'

export interface OwnerBase {
  loading: boolean
  error: string | null
  vehicles: Vehicle[]
  /** poslednja vrednost brojača svakog vozila (km ili sati) */
  odometers: Record<string, number>
  reminders: Reminder[]
  drivers: Driver[]
  reload: () => Promise<void>
  reloadOdometers: () => Promise<void>
  reloadReminders: () => Promise<void>
  reloadDrivers: () => Promise<void>
}

/** Vozila, podsetnici i vozači vlasnika. */
export function useOwnerBase(): OwnerBase {
  const api = getApi().owner
  const [state, setState] = useState({
    loading: true,
    error: null as string | null,
    vehicles: [] as Vehicle[],
    odometers: {} as Record<string, number>,
    reminders: [] as Reminder[],
    drivers: [] as Driver[],
  })

  const reload = useCallback(async () => {
    try {
      const [vehicles, odometers, reminders, drivers] = await Promise.all([
        api.listVehicles(),
        api.odometers(),
        api.listReminders(),
        api.listDrivers(),
      ])
      setState({ loading: false, error: null, vehicles, odometers, reminders, drivers })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errorText(e) }))
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  const reloadOdometers = useCallback(async () => {
    const odometers = await api.odometers()
    setState((s) => ({ ...s, odometers }))
  }, [api])
  const reloadReminders = useCallback(async () => {
    const reminders = await api.listReminders()
    setState((s) => ({ ...s, reminders }))
  }, [api])
  const reloadDrivers = useCallback(async () => {
    const drivers = await api.listDrivers()
    setState((s) => ({ ...s, drivers }))
  }, [api])

  return { ...state, reload, reloadOdometers, reloadReminders, reloadDrivers }
}

export interface ExpensesData {
  expenses: Expense[]
  loading: boolean
  error: string | null
  reload: () => void
}

/** Troškovi izabranog vozila. Dok se učitava drugo vozilo, ne prikazuju se tuđi unosi. */
export function useExpenses(vehicleId: string | null): ExpensesData {
  const api = getApi().owner
  const [loaded, setLoaded] = useState<{ forId: string; list: Expense[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const request = useRef(0)

  useEffect(() => {
    if (!vehicleId) {
      setLoaded(null)
      return
    }
    const mine = ++request.current
    setLoading(true)
    api
      .listExpenses(vehicleId)
      .then((list) => {
        if (mine !== request.current) return
        setLoaded({ forId: vehicleId, list })
        setError(null)
      })
      .catch((e) => {
        if (mine === request.current) setError(errorText(e))
      })
      .finally(() => {
        if (mine === request.current) setLoading(false)
      })
  }, [api, vehicleId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { expenses: loaded && loaded.forId === vehicleId ? loaded.list : [], loading, error, reload }
}
