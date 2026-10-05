import { useState, type FormEvent } from 'react'
import { FormError, TextField } from '../components/Fields'
import { errorText, getApi, type DriverCreds } from '../lib/api'
import { storage } from '../lib/storage'
import type { DriverSession } from '../lib/types'
import { useTheme } from '../lib/theme'
import { Icon } from '../components/Icon'

const CODE_KEY = 'kod-vozaca'
const normalizeCode = (s: string): string => s.replace(/[^0-9a-z]/gi, '').toUpperCase()

/** Kod iz linka (?k=...) se pamti na telefonu i skida iz adrese, da vozač kasnije kuca samo PIN. */
function initialCode(): string {
  try {
    const k = new URLSearchParams(window.location.search).get('k')
    if (k) {
      storage.set(CODE_KEY, normalizeCode(k))
      window.history.replaceState(null, '', window.location.pathname)
    }
  } catch {
    /* nije bitno */
  }
  return storage.get(CODE_KEY) ?? ''
}

interface Props {
  onDriver: (login: { creds: DriverCreds; session: DriverSession }) => void
}

export function Login({ onDriver }: Props) {
  const api = getApi()
  const [code, setCode] = useState(initialCode)
  const [who, setWho] = useState<'owner' | 'driver'>(code ? 'driver' : 'owner')
  const [theme, setTheme] = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitOwner(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) return setError('Upišite email i lozinku.')
    setBusy(true)
    try {
      await api.owner.signIn(email, password)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function submitDriver(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const clean = normalizeCode(code)
    if (clean.length < 6) return setError('Upišite kod koji ste dobili od vlasnika.')
    if (!pin) return setError('Upišite PIN.')
    setBusy(true)
    try {
      const creds = { code: clean, pin }
      const session = await api.driver.login(creds)
      storage.set(CODE_KEY, clean)
      onDriver({ creds, session })
    } catch (err) {
      setError(errorText(err))
      setPin('')
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card card">
        <div className="login-top">
          <h1 className="brand">Troškovi vozila</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Izgled: ${theme === 'auto' ? 'automatski' : theme === 'dark' ? 'tamni' : 'svetli'}. Promeni`}
            onClick={() => setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto')}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
          </button>
        </div>

        <div className="seg seg--light" role="tablist" aria-label="Ko se prijavljuje">
          <button type="button" role="tab" aria-selected={who === 'owner'} aria-pressed={who === 'owner'} onClick={() => { setWho('owner'); setError(null) }}>
            Vlasnik
          </button>
          <button type="button" role="tab" aria-selected={who === 'driver'} aria-pressed={who === 'driver'} onClick={() => { setWho('driver'); setError(null) }}>
            Vozač
          </button>
        </div>

        {who === 'owner' ? (
          <form className="form" onSubmit={submitOwner} noValidate>
            <TextField label="Email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField label="Lozinka" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <FormError text={error} />
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Prijavljujem…' : 'Prijavi se'}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={submitDriver} noValidate>
            <TextField
              label="Kod vozača"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="npr. A1B2C-3D4E5"
              hint="Dobili ste ga od vlasnika (nalazi se u linku)."
            />
            <TextField
              label="PIN"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={Boolean(code)}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            <FormError text={error} />
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Proveravam…' : 'Nastavi'}
            </button>
          </form>
        )}

        {__DEMO__ && (
          <p className="hint demo-hint">
            PROBNA VERZIJA (podaci su u memoriji). Vlasnik: bilo koji email i lozinka. Vozač: kod A1B2C3D4E5, PIN 1234 (vozila i mašine) ili kod C0FFEE1234, PIN 4321 (samo mašine).
          </p>
        )}
      </div>
    </main>
  )
}
