import { SECTIONS, SECTION_COPY, type Section } from '../lib/sections'
import { Icon } from './Icon'

interface Props {
  section: Section
  onChange: (s: Section) => void
  /** Koliko upozorenja ima svaki deo (crveni broj na dugmetu). */
  counts?: Partial<Record<Section, number>>
  /** Koji delovi se nude (vozač vidi samo ono što ima). */
  available?: Section[]
}

/** Prekidač između dva dela aplikacije: Vozila (km) i Radne mašine (sati). */
export function SectionSwitch({ section, onChange, counts = {}, available = SECTIONS }: Props) {
  return (
    <div className="seg" role="group" aria-label="Deo aplikacije">
      {SECTIONS.filter((s) => available.includes(s)).map((s) => (
        <button key={s} type="button" aria-pressed={section === s} onClick={() => onChange(s)}>
          <Icon name={s === 'vozila' ? 'car' : 'forklift'} size={18} />
          <span>{SECTION_COPY[s].label}</span>
          {(counts[s] ?? 0) > 0 && (
            <span className="seg-badge" aria-label={`${counts[s]} upozorenja`}>
              {counts[s]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
