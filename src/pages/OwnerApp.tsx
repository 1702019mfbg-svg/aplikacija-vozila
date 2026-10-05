import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ExpenseForm, type ExpenseFormValue } from '../components/ExpenseForm'
import { FormError, TextField } from '../components/Fields'
import { Icon, type IconName } from '../components/Icon'
import { Modal } from '../components/Modal'
import { SectionSwitch } from '../components/SectionSwitch'
import { useToast } from '../components/Toast'
import { useExpenses, useOwnerBase } from '../hooks/useOwnerData'
import { errorText, getApi, type OwnerUser } from '../lib/api'
import { PERIODS, latestOdometer, type Period } from '../lib/calc'
import { collectAlerts, markDone } from '../lib/reminders'
import { SECTION_COPY, categoriesFor, sectionOf, vehicleTitle, vehiclesIn, type Section } from '../lib/sections'
import { storage } from '../lib/storage'
import { THEME_LABELS, useTheme, type ThemeChoice } from '../lib/theme'
import { CATEGORIES, type Category, type Expense, type Vehicle } from '../lib/types'
import { Podsetnici } from './Podsetnici'
import { Pregled } from './Pregled'
import { Unosi } from './Unosi'
import { VehicleForm, Vozila } from './Vozila'
import { Vozaci } from './Vozaci'

type Tab = 'pregled' | 'unosi' | 'podsetnici' | 'vozila' | 'vozaci'

const SECTION_KEY = 'deo'
const PERIOD_KEY = 'period'
const vehicleKey = (s: Section) => `vozilo-${s}`

function storedPeriod(): Period {
  const p = storage.get(PERIOD_KEY)
  return PERIODS.some((x) => x.id === p) ? (p as Period) : 'mesec'
}

export function OwnerApp({ user, onSignOut }: { user: OwnerUser; onSignOut: () => void }) {
  const toast = useToast()
  const base = useOwnerBase()
  const [theme, setTheme] = useTheme()

  const [section, setSectionState] = useState<Section>(() => (storage.get(SECTION_KEY) === 'masine' ? 'masine' : 'vozila'))
  const [tab, setTab] = useState<Tab>('pregled')
  const [period, setPeriodState] = useState<Period>(storedPeriod)
  const [includeAmort, setIncludeAmort] = useState(true)
  const [chosen, setChosen] = useState<Partial<Record<Section, string>>>(() => ({
    vozila: storage.get(vehicleKey('vozila')) ?? undefined,
    masine: storage.get(vehicleKey('masine')) ?? undefined,
  }))
  const [pendingOnly, setPendingOnly] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expenseModal, setExpenseModal] = useState<{ expense: Expense | null } | null>(null)
  const [vehicleModal, setVehicleModal] = useState<{ vehicle: Vehicle | null } | null>(null)
  const [passwordModal, setPasswordModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const copy = SECTION_COPY[section]
  const sectionVehicles = useMemo(() => vehiclesIn(base.vehicles, section), [base.vehicles, section])
  const vehicle = sectionVehicles.find((v) => v.id === chosen[section]) ?? sectionVehicles[0] ?? null
  const exp = useExpenses(vehicle?.id ?? null)
  const currentMeter = vehicle ? Math.max(base.odometers[vehicle.id] ?? 0, latestOdometer(vehicle, exp.expenses)) : 0

  const alertsAll = useMemo(() => collectAlerts(base.reminders, base.vehicles, base.odometers), [base.reminders, base.vehicles, base.odometers])
  const sectionAlerts = alertsAll.filter((a) => sectionOf(a.vehicle.meter_unit) === section)
  const counts = {
    vozila: alertsAll.filter((a) => sectionOf(a.vehicle.meter_unit) === 'vozila').length,
    masine: alertsAll.filter((a) => sectionOf(a.vehicle.meter_unit) === 'masine').length,
  }
  const alertVehicleIds = new Set(alertsAll.map((a) => a.vehicle.id))

  // zatvaranje menija klikom van njega ili sa Esc
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  function changeSection(s: Section) {
    setSectionState(s)
    storage.set(SECTION_KEY, s)
    setPendingOnly(false)
  }
  function selectVehicle(id: string) {
    setChosen((c) => ({ ...c, [section]: id }))
    storage.set(vehicleKey(section), id)
    setPendingOnly(false)
  }
  function changePeriod(p: Period) {
    setPeriodState(p)
    storage.set(PERIOD_KEY, p)
  }

  function openAlert(vehicleId: string) {
    const v = base.vehicles.find((x) => x.id === vehicleId)
    if (!v) return
    const s = sectionOf(v.meter_unit)
    changeSection(s)
    setChosen((c) => ({ ...c, [s]: v.id }))
    storage.set(vehicleKey(s), v.id)
    setTab('podsetnici')
  }

  async function afterExpenseChange() {
    exp.reload()
    await base.reloadOdometers()
  }

  async function saveExpense(v: ExpenseFormValue, existing: Expense | null) {
    if (!vehicle) return
    const api = getApi().owner
    await api.saveExpense(
      {
        vehicle_id: vehicle.id, expense_date: v.expense_date, category: v.category, amount: v.amount, odometer: v.odometer,
        liters: v.liters, full_tank: v.full_tank, note: v.note,
      },
      existing?.id,
    )
    if (v.renewReminderId) {
      const reminder = base.reminders.find((r) => r.id === v.renewReminderId)
      if (reminder) {
        await api.saveReminder(markDone(reminder, currentMeter, v.expense_date), reminder.id)
        await base.reloadReminders()
      }
    }
    await afterExpenseChange()
    toast(existing ? 'Izmene su sačuvane.' : v.renewReminderId ? 'Trošak je sačuvan, a rok podsetnika pomeren.' : 'Trošak je sačuvan.')
    setExpenseModal(null)
  }

  async function deleteExpense(e: Expense) {
    await getApi().owner.deleteExpense(e.id)
    await afterExpenseChange()
    toast('Unos je obrisan.')
    setExpenseModal(null)
  }

  if (base.loading) return <div className="splash" aria-busy="true" />
  if (base.error && base.vehicles.length === 0) {
    return (
      <main className="login">
        <div className="login-card card">
          <h1 className="brand">Troškovi vozila</h1>
          <p className="form-error" role="alert">
            {base.error}
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn--primary" onClick={() => void base.reload()}>
              Pokušaj ponovo
            </button>
            <button type="button" className="btn" onClick={onSignOut}>
              Odjava
            </button>
          </div>
        </div>
      </main>
    )
  }

  const categoryIds: Category[] = categoriesFor(section, CATEGORIES.map((c) => c.id))
  const editing = expenseModal?.expense ?? null
  const formCategories = editing && !categoryIds.includes(editing.category) ? [...categoryIds, editing.category] : categoryIds

  const nav: { id: Tab; label: string; icon: IconName; badge?: number }[] = [
    { id: 'pregled', label: 'Pregled', icon: 'gauge' },
    { id: 'unosi', label: 'Unosi', icon: 'list' },
    { id: 'podsetnici', label: 'Podsetnici', icon: 'bell', badge: sectionAlerts.length },
    { id: 'vozila', label: copy.manage, icon: section === 'masine' ? 'forklift' : 'car' },
    { id: 'vozaci', label: 'Vozači', icon: 'users' },
  ]
  const needsVehicle = tab === 'pregled' || tab === 'unosi' || tab === 'podsetnici'

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-top">
            <h1 className="brand">Troškovi vozila</h1>
            <div className="menu-wrap" ref={menuRef}>
              <button type="button" className="icon-btn icon-btn--header" aria-label="Meni" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                <Icon name="dots" />
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <p className="menu-user">{user.email}</p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setTheme((({ auto: 'light', light: 'dark', dark: 'auto' }) as Record<ThemeChoice, ThemeChoice>)[theme])}
                  >
                    <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} /> Izgled: {THEME_LABELS[theme]}
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setPasswordModal(true) }}>
                    <Icon name="key" size={18} /> Promena lozinke
                  </button>
                  <button type="button" role="menuitem" onClick={onSignOut}>
                    <Icon name="logout" size={18} /> Odjava
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="header-controls">
            <SectionSwitch section={section} onChange={changeSection} counts={counts} />
            {sectionVehicles.length > 0 && vehicle && (
              <select className="header-select" aria-label={copy.select} value={vehicle.id} onChange={(e) => selectVehicle(e.target.value)}>
                {sectionVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {alertVehicleIds.has(v.id) ? '⚠ ' : ''}
                    {vehicleTitle(v)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <nav className="nav" aria-label="Glavni meni">
            {nav.map((n) => (
              <button key={n.id} type="button" aria-current={tab === n.id ? 'page' : undefined} onClick={() => setTab(n.id)}>
                <span className="nav-icon">
                  <Icon name={n.icon} size={22} />
                  {(n.badge ?? 0) > 0 && <span className="nav-badge">{n.badge}</span>}
                </span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {base.error && <p className="form-error" role="alert">{base.error}</p>}
        {exp.error && <p className="form-error" role="alert">{exp.error}</p>}

        {needsVehicle && !vehicle ? (
          <div className="card empty">
            <p>
              <strong>{copy.empty}</strong>
            </p>
            <p className="muted">{copy.emptyHint}</p>
            <button type="button" className="btn btn--primary" onClick={() => setVehicleModal({ vehicle: null })}>
              <Icon name="plus" size={18} /> {copy.add}
            </button>
          </div>
        ) : tab === 'pregled' && vehicle ? (
          <Pregled
            vehicle={vehicle}
            expenses={exp.expenses}
            loading={exp.loading}
            alerts={sectionAlerts}
            showVehicleInAlerts={sectionVehicles.length > 1}
            period={period}
            onPeriod={changePeriod}
            includeAmort={includeAmort}
            onIncludeAmort={setIncludeAmort}
            onOpenAlert={openAlert}
            onOpenPending={() => {
              setPendingOnly(true)
              setTab('unosi')
            }}
            onEditVehicle={() => setVehicleModal({ vehicle })}
          />
        ) : tab === 'unosi' && vehicle ? (
          <Unosi
            vehicle={vehicle}
            expenses={exp.expenses}
            loading={exp.loading}
            period={period}
            onPeriod={changePeriod}
            pendingOnly={pendingOnly}
            onPendingOnly={setPendingOnly}
            onEdit={(e) => setExpenseModal({ expense: e })}
          />
        ) : tab === 'podsetnici' && vehicle ? (
          <Podsetnici section={section} vehicle={vehicle} reminders={base.reminders} currentMeter={currentMeter} onChanged={base.reloadReminders} />
        ) : tab === 'vozila' ? (
          <Vozila section={section} vehicles={sectionVehicles} odometers={base.odometers} onAdd={() => setVehicleModal({ vehicle: null })} onEdit={(v) => setVehicleModal({ vehicle: v })} />
        ) : tab === 'vozaci' ? (
          <Vozaci drivers={base.drivers} vehicles={base.vehicles} onChanged={base.reloadDrivers} />
        ) : null}
      </main>

      {vehicle && (tab === 'pregled' || tab === 'unosi') && (
        <button type="button" className="fab" onClick={() => setExpenseModal({ expense: null })}>
          <Icon name="plus" size={22} /> <span>Novi trošak</span>
        </button>
      )}

      {expenseModal && vehicle && (
        <Modal title={editing ? 'Izmena troška' : 'Novi trošak'} onClose={() => setExpenseModal(null)}>
          <ExpenseForm
            key={editing?.id ?? 'new'}
            mode="owner"
            vehicle={vehicle}
            lastOdometer={currentMeter}
            initial={editing}
            categories={formCategories}
            reminders={base.reminders.filter((r) => r.vehicle_id === vehicle.id)}
            onSubmit={(v) => saveExpense(v, editing)}
            onDelete={editing ? () => deleteExpense(editing) : undefined}
            onCancel={() => setExpenseModal(null)}
          />
        </Modal>
      )}

      {vehicleModal && (
        <Modal title={vehicleModal.vehicle ? copy.editTitle : copy.newTitle} onClose={() => setVehicleModal(null)}>
          <VehicleForm
            section={vehicleModal.vehicle ? sectionOf(vehicleModal.vehicle.meter_unit) : section}
            initial={vehicleModal.vehicle}
            onClose={() => setVehicleModal(null)}
            onSaved={async (saved) => {
              await base.reload()
              const s = sectionOf(saved.meter_unit)
              setChosen((c) => ({ ...c, [s]: saved.id }))
              storage.set(vehicleKey(s), saved.id)
            }}
            onDeleted={async () => {
              await base.reload()
              exp.reload()
            }}
          />
        </Modal>
      )}

      {passwordModal && (
        <Modal title="Promena lozinke" onClose={() => setPasswordModal(false)}>
          <PasswordForm onClose={() => setPasswordModal(false)} />
        </Modal>
      )}
    </div>
  )
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 10) return setError('Lozinka mora imati bar 10 znakova.')
    if (password !== repeat) return setError('Lozinke se ne poklapaju.')
    setBusy(true)
    setError(null)
    try {
      await getApi().owner.changePassword(password)
      toast('Lozinka je promenjena.')
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField label="Nova lozinka (bar 10 znakova)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextField label="Ponovite lozinku" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      <FormError text={error} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Čuvam…' : 'Promeni lozinku'}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Otkaži
        </button>
      </div>
    </form>
  )
}
