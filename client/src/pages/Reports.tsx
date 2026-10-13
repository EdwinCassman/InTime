import { useEffect, useState } from 'react'
import { api, type HoursSummary } from '../lib/api'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Trims trailing zeros (7 instead of 7.00, 7.5 instead of 7.50).
function formatHours(hours: number): string {
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// "2e" (enkel övertid) / "7d" (dubbel övertid), combined when both apply.
function overtimeNote(row: HoursSummary): string | null {
  const parts: string[] = []
  if (row.simpleOvertimeHours > 0) parts.push(`${formatHours(row.simpleOvertimeHours)}e`)
  if (row.doubleOvertimeHours > 0) parts.push(`${formatHours(row.doubleOvertimeHours)}d`)
  return parts.length > 0 ? parts.join(', ') : null
}

export function Reports() {
  const [month, setMonth] = useState(currentMonth())
  const [summary, setSummary] = useState<HoursSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<HoursSummary[]>(`/reports/hours-summary?month=${month}`)
      .then(setSummary)
      .catch(() => setError('Kunde inte ladda rapporten.'))
  }, [month])

  const total = summary.reduce((sum, row) => sum + row.hours, 0)
  const totalSimple = summary.reduce((sum, row) => sum + row.simpleOvertimeHours, 0)
  const totalDouble = summary.reduce((sum, row) => sum + row.doubleOvertimeHours, 0)
  const totalNote = overtimeNote({ userId: '', name: '', hours: 0, simpleOvertimeHours: totalSimple, doubleOvertimeHours: totalDouble })

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Månad</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Anställd</th>
              <th className="px-4 py-2">Arbetade timmar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {summary.map((row) => (
              <tr key={row.userId}>
                <td className="px-4 py-2 dark:text-slate-200">{row.name}</td>
                <td className="px-4 py-2 dark:text-slate-200">
                  {row.hours.toFixed(2)}
                  {overtimeNote(row) && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">({overtimeNote(row)})</span>}
                </td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga avslutade pass denna månad än.
                </td>
              </tr>
            )}
          </tbody>
          {summary.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-medium dark:border-slate-700">
                <td className="px-4 py-2 dark:text-slate-200">Totalt</td>
                <td className="px-4 py-2 dark:text-slate-200">
                  {total.toFixed(2)}
                  {totalNote && <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">({totalNote})</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {summary.some((r) => r.simpleOvertimeHours > 0 || r.doubleOvertimeHours > 0) && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          e = enkel övertid (vardag, midnatt–07:00) · d = dubbel övertid (lördag/söndag)
        </p>
      )}
    </div>
  )
}
