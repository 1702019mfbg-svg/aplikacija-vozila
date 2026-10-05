/** Veliki broj u stilu odometra: svaka cifra u svom polju, decimale u obrnutim bojama (kao na pravom brojaču). */
export function Odometar({ text, label }: { text: string; label: string }) {
  const comma = text.indexOf(',')
  return (
    <div className="odo" role="img" aria-label={label}>
      {[...text].map((ch, i) => {
        if (!/\d/.test(ch)) {
          return ch === '–' ? (
            <span key={i} className="odo-cell odo-cell--empty">
              –
            </span>
          ) : (
            <span key={i} className="odo-sep">
              {ch}
            </span>
          )
        }
        const decimal = comma >= 0 && i > comma
        return (
          <span key={i} className={`odo-cell${decimal ? ' odo-cell--dec' : ''}`}>
            {ch}
          </span>
        )
      })}
    </div>
  )
}
