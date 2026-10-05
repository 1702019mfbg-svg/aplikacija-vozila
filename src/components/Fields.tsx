import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface Common {
  label: string
  error?: string
  hint?: string
}

function Wrap({ id, label, error, hint, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-e`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const describe = (id: string, error?: string, hint?: string) => (error ? `${id}-e` : hint ? `${id}-h` : undefined)

export function TextField({ label, error, hint, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describe(id, error, hint)} {...rest} />
    </Wrap>
  )
}

export function SelectField({ label, error, hint, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describe(id, error, hint)} {...rest}>
        {children}
      </select>
    </Wrap>
  )
}

export function TextAreaField({ label, error, hint, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <Wrap id={id} label={label} error={error} hint={hint}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describe(id, error, hint)} {...rest} />
    </Wrap>
  )
}

export function CheckField({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>
        {label}
        {hint && <small className="hint">{hint}</small>}
      </span>
    </label>
  )
}

/** Poruka o grešci nad dugmadima obrasca (npr. problem sa vezom). */
export function FormError({ text }: { text: string | null }) {
  return text ? (
    <p className="form-error" role="alert">
      {text}
    </p>
  ) : null
}
