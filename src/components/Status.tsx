import type { ReminderStatus } from '../lib/reminders'
import { Icon, type IconName } from './Icon'

const STATUS: Record<ReminderStatus, { label: string; icon: IconName }> = {
  ok: { label: 'U redu', icon: 'check' },
  soon: { label: 'Uskoro', icon: 'warn' },
  overdue: { label: 'Isteklo', icon: 'cross' },
}

/** Stanje roka: uvek ikona + reč + boja, nikad samo boja. */
export function Status({ status }: { status: ReminderStatus }) {
  const s = STATUS[status]
  return (
    <span className={`badge badge--${status}`}>
      <Icon name={s.icon} size={14} />
      {s.label}
    </span>
  )
}
