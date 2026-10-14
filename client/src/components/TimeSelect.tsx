// A 24-hour hour/minute picker, in 15-minute steps. Native <input type="time">
// renders in 12h/AM-PM or 24h format based on the device's regional settings,
// not anything the page controls — this sidesteps that entirely by building
// the picker ourselves.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

export function TimeSelect({
  value,
  onChange,
  className = '',
}: {
  value: string // "HH:mm", or "" if unset
  onChange: (value: string) => void
  className?: string
}) {
  const [hh, mm] = value ? value.split(':') : ['', '']
  const selectClass = `rounded border border-slate-300 bg-white px-1.5 py-1 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 ${className}`

  return (
    <span className="inline-flex items-center gap-0.5">
      <select value={hh} onChange={(e) => onChange(`${e.target.value}:${mm || '00'}`)} className={selectClass}>
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-slate-400 dark:text-slate-500">:</span>
      <select value={mm} onChange={(e) => onChange(`${hh || '00'}:${e.target.value}`)} className={selectClass}>
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  )
}
