import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, type HoursSummary, type MonthlyHoursRow, type PayrollLock } from '../lib/api'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const lockDateFormatter = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: false })

// Trims trailing zeros (7 instead of 7.00, 7.5 instead of 7.50).
function formatHours(hours: number): string {
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// "2e" (enkel övertid) / "7d" (dubbel övertid), combined when both apply.
function overtimeNote(simple: number, double: number): string | null {
  const parts: string[] = []
  if (simple > 0) parts.push(`${formatHours(simple)}e`)
  if (double > 0) parts.push(`${formatHours(double)}d`)
  return parts.length > 0 ? parts.join(', ') : null
}

export function Reports() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [month, setMonth] = useState(currentMonth())
  const [monthInput, setMonthInput] = useState(month) // mirrors the raw input value, even mid-edit (e.g. briefly cleared)
  const [error, setError] = useState<string | null>(null)

  const [summary, setSummary] = useState<HoursSummary[]>([])
  const [monthlyRows, setMonthlyRows] = useState<MonthlyHoursRow[]>([])
  const [view, setView] = useState<'current' | 'expected'>('current')
  const [scopeUserId, setScopeUserId] = useState('all')
  const [lock, setLock] = useState<PayrollLock | null>(null)
  const [lockBusy, setLockBusy] = useState(false)

  function loadLock() {
    if (!isAdmin) return
    api
      .get<PayrollLock>(`/reports/payroll-lock?month=${month}`)
      .then(setLock)
      .catch(() => setError('Kunde inte ladda låsstatus.'))
  }

  async function toggleLock() {
    if (!lock) return
    const willLock = !lock.lockedAt
    if (
      !confirm(
        willLock
          ? `Lås ${month} som skickad till löneadministrationen? Ändringar av pass efter detta läggs på nästa månad istället.`
          : `Lås upp ${month}? Framtida ändringar räknas då in i den här månaden igen tills den låses på nytt.`,
      )
    )
      return
    setLockBusy(true)
    try {
      if (willLock) {
        setLock(await api.post<PayrollLock>('/reports/payroll-lock', { month }))
      } else {
        setLock(await api.delete<PayrollLock>(`/reports/payroll-lock/${month}`))
      }
      api
        .get<MonthlyHoursRow[]>(`/reports/monthly-hours?month=${month}`)
        .then(setMonthlyRows)
        .catch(() => setError('Kunde inte ladda rapporten.'))
    } catch {
      setError('Kunde inte uppdatera låsstatusen.')
    } finally {
      setLockBusy(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      api
        .get<MonthlyHoursRow[]>(`/reports/monthly-hours?month=${month}`)
        .then(setMonthlyRows)
        .catch(() => setError('Kunde inte ladda rapporten.'))
      loadLock()
    } else {
      api
        .get<HoursSummary[]>(`/reports/hours-summary?month=${month}`)
        .then(setSummary)
        .catch(() => setError('Kunde inte ladda rapporten.'))
    }
  }, [month, isAdmin])

  const monthPicker = (
    <div className="mb-4 flex items-center gap-3">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Månad</label>
      <input
        type="month"
        value={monthInput}
        onChange={(e) => {
          setMonthInput(e.target.value)
          if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value)
        }}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
      />
    </div>
  )

  if (!isAdmin) {
    const total = summary.reduce((sum, row) => sum + row.hours, 0)
    const totalSimple = summary.reduce((sum, row) => sum + row.simpleOvertimeHours, 0)
    const totalDouble = summary.reduce((sum, row) => sum + row.doubleOvertimeHours, 0)

    return (
      <div>
        {monthPicker}
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
                    {overtimeNote(row.simpleOvertimeHours, row.doubleOvertimeHours) && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                        ({overtimeNote(row.simpleOvertimeHours, row.doubleOvertimeHours)})
                      </span>
                    )}
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
                    {overtimeNote(totalSimple, totalDouble) && (
                      <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                        ({overtimeNote(totalSimple, totalDouble)})
                      </span>
                    )}
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

  const rows = scopeUserId === 'all' ? monthlyRows : monthlyRows.filter((r) => r.userId === scopeUserId)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {monthPicker}
        <div className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-600">
          <button
            onClick={() => setView('current')}
            className={`px-3 py-1.5 text-sm ${view === 'current' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            Nuvarande arbetade timmar
          </button>
          <button
            onClick={() => setView('expected')}
            className={`border-l border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 ${view === 'expected' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            Förväntade arbetade timmar
          </button>
        </div>
        <select
          value={scopeUserId}
          onChange={(e) => setScopeUserId(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="all">Alla anställda</option>
          {monthlyRows.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.name}
            </option>
          ))}
        </select>
        {lock && (
          <button
            onClick={toggleLock}
            disabled={lockBusy}
            className={`rounded border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              lock.lockedAt
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
            }`}
          >
            {lock.lockedAt ? `Låst ${lockDateFormatter.format(new Date(lock.lockedAt))} — Lås upp` : 'Lås månaden (timmar skickade)'}
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Anställd</th>
              {view === 'current' ? (
                <>
                  <th className="px-4 py-2">Arbetade timmar (hittills)</th>
                  <th className="px-4 py-2">Varav semester</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-2">Förväntade timmar</th>
                  <th className="px-4 py-2">Justering (föregående månad)</th>
                  <th className="px-4 py-2">Att rapportera</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map((row) => (
              <tr key={row.userId}>
                <td className="px-4 py-2 align-top dark:text-slate-200">{row.name}</td>
                {view === 'current' ? (
                  <>
                    <td className="px-4 py-2 align-top dark:text-slate-200">
                      {formatHours(row.currentHours)}
                      {overtimeNote(row.currentSimpleOvertimeHours, row.currentDoubleOvertimeHours) && (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                          ({overtimeNote(row.currentSimpleOvertimeHours, row.currentDoubleOvertimeHours)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-slate-500 dark:text-slate-400">
                      {row.vacationHours > 0 ? `${formatHours(row.vacationHours)}h` : '—'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 align-top dark:text-slate-200">
                      {formatHours(row.expectedHours)}
                      {overtimeNote(row.expectedSimpleOvertimeHours, row.expectedDoubleOvertimeHours) && (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                          ({overtimeNote(row.expectedSimpleOvertimeHours, row.expectedDoubleOvertimeHours)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {row.adjustmentItems.length > 0 ? (
                        <div>
                          <span
                            className={`font-medium ${row.adjustmentHours < 0 ? 'text-red-600 dark:text-red-400' : row.adjustmentHours > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                          >
                            {row.adjustmentHours > 0 ? '+' : ''}
                            {formatHours(row.adjustmentHours)}h
                          </span>
                          <ul className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            {row.adjustmentItems.map((item, i) => (
                              <li key={i}>
                                {item.hours > 0 ? '+' : ''}
                                {formatHours(item.hours)}h {item.date}, {item.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top font-medium dark:text-slate-200">
                      {formatHours(row.expectedHours + row.adjustmentHours)}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={view === 'current' ? 3 : 4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga anställda än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view === 'current' && monthlyRows.some((r) => r.currentSimpleOvertimeHours > 0 || r.currentDoubleOvertimeHours > 0) && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          e = enkel övertid (vardag, midnatt–07:00) · d = dubbel övertid (lördag/söndag)
        </p>
      )}
      {view === 'expected' && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Ändringar som görs innan en månad låses räknas direkt in i den månadens timmar. Efter låsning läggs
          ändringar istället på nästa månad: Sjuk/VAB/Ledig drar av timmar från den som var borta, och den som täckte
          passet får motsvarande timmar tillagda (gäller även Semester för den som täcker).
        </p>
      )}
    </div>
  )
}
