import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText, getApi } from '../lib/api'
import type { Driver, Expense, FuelPrice, Reminder, Vehicle } from '../lib/types'

export interface OwnerBase {
  loading: boolean
  error: string | null
  vehicles: Vehicle[]
  /** poslednja vrednost brojača svakog vozila (km ili sati) */
  odometers: Record<string, number>
  reminders: Reminder[]
  drivers: Driver[]
  /** cene goriva (svaka vrsta goriva ima istoriju sa datumom "važi od") */
  fuelPrices: FuelPrice[]
  /** false ako se cene ne mogu pročitati (baza još nije ažurirana novijom šemom) */
  pricesReady: boolean
  reload: () => Promise<void>
  reloadOdometers: () => Promise<void>
  reloadReminders: () => Promise<void>
  reloadDrivers: () => Promise<void>
  reloadFuelPrices: () => Promise<void>
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
    fuelPrices: [] as FuelPrice[],
    pricesReady: true,
  })

  const reload = useCallback(async () => {
    try {
      const [vehicles, odometers, reminders, drivers, prices] = await Promise.all([
        api.listVehicles(),
        api.odometers(),
        api.listReminders(),
        api.listDrivers(),
        // cene goriva su novije od ostalog: ako baza još nije ažurirana, sve ostalo mora da radi
        api.listFuelPrices().then(
          (fuelPrices) => ({ fuelPrices, pricesReady: true }),
          () => ({ fuelPrices: [] as FuelPrice[], pricesReady: false }),
        ),
      ])
      setState({ loading: false, error: null, vehicles, odometers, reminders, drivers, ...prices })
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
  const reloadFuelPrices = useCallback(async () => {
    const fuelPrices = await api.listFuelPrices()
    setState((s) => ({ ...s, fuelPrices, pricesReady: true }))
  }, [api])

  return { ...state, reload, reloadOdometers, reloadReminders, reloadDrivers, reloadFuelPrices }
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
