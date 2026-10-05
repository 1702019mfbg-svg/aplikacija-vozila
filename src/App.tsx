import { useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { getApi, type DriverCreds, type OwnerUser } from './lib/api'
import { isConfigured } from './lib/config'
import type { DriverSession } from './lib/types'
import { DriverApp } from './pages/DriverApp'
import { Login } from './pages/Login'
import { OwnerApp } from './pages/OwnerApp'
import { SetupNeeded } from './pages/SetupNeeded'

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </ErrorBoundary>
  )
}

function Shell() {
  const api = getApi()
  const [ready, setReady] = useState(false)
  const [owner, setOwner] = useState<OwnerUser | null>(null)
  const [driver, setDriver] = useState<{ creds: DriverCreds; session: DriverSession } | null>(null)

  useEffect(() => {
    let alive = true
    api.owner
      .getUser()
      .then((u) => alive && setOwner(u))
      .catch(() => undefined)
      .finally(() => alive && setReady(true))
    const off = api.owner.onAuthChange((u) => alive && setOwner(u))
    return () => {
      alive = false
      off()
    }
  }, [api])

  if (!ready) return <div className="splash" aria-busy="true" />
  if (owner) return <OwnerApp user={owner} onSignOut={() => void api.owner.signOut()} />
  if (driver) return <DriverApp creds={driver.creds} session={driver.session} onLogout={() => setDriver(null)} />
  return <Login onDriver={setDriver} />
}
