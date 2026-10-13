import { useEffect, useMemo, useState } from 'react'
import { api, nextDateForCycleDay, type Employee, type RecurringAssignment, type ShiftTemplate } from '../lib/api'
import { templateSelectClass } from '../lib/shiftColors'

const DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const CYCLE_DAYS = Array.from({ length: 14 }, (_, i) => ({
  cycleDay: i,
  week: i < 7 ? 1 : 2,
  label: DAY_LABELS[i % 7],
}))

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { month: 'short', day: 'numeric' })

export function RecurringSchedule() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [assignments, setAssignments] = useState<RecurringAssignment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const nextDates = useMemo(() => {
    const now = new Date()
    return CYCLE_DAYS.map((d) => nextDateForCycleDay(d.cycleDay, now))
  }, [])

  async function load() {
    try {
      const [emps, tpls, assigns] = await Promise.all([
        api.get<Employee[]>('/employees'),
        api.get<ShiftTemplate[]>('/shift-templates'),
        api.get<RecurringAssignment[]>('/recurring-assignments'),
      ])
      setEmployees(emps)
      setTemplates(tpls)
      setAssignments(assigns)
    } catch {
      setError('Kunde inte ladda det återkommande schemat.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  function assignmentFor(userId: string, cycleDay: number) {
    return assignments.find((a) => a.userId === userId && a.cycleDay === cycleDay)
  }

  async function setCell(userId: string, cycleDay: number, shiftTemplateId: string | null) {
    const key = `${userId}-${cycleDay}`
    setSavingKey(key)
    setError(null)
    try {
      await api.put('/recurring-assignments', { userId, cycleDay, shiftTemplateId })
      await load()
    } catch {
      setError('Kunde inte spara ändringen.')
    } finally {
      setSavingKey(null)
    }
  }

  async function copyWeek1ToWeek2(userId: string) {
    setError(null)
    try {
      await Promise.all(
        CYCLE_DAYS.filter((d) => d.week === 1).map((d) => {
          const source = assignmentFor(userId, d.cycleDay)
          return api.put('/recurring-assignments', {
            userId,
            cycleDay: d.cycleDay + 7,
            shiftTemplateId: source?.shiftTemplateId ?? null,
          })
        }),
      )
      await load()
    } catch {
      setError('Kunde inte kopiera vecka 1 till vecka 2.')
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Återkommande schema</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Varje anställds stående mönster över en upprepande 2-veckorscykel — använd detta för rotationer
          som 7 dagar jobb/7 dagar ledigt som skiljer sig mellan vecka 1 och vecka 2. De kommande två
          veckorna hålls automatiskt ifyllda; att ta bort ett genererat pass på schemasidan (t.ex. vid
          sjukdom) påverkar bara den dagen och genereras inte om.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2" rowSpan={2}>
                Anställd
              </th>
              <th className="px-2 py-1 text-center" colSpan={7}>
                Vecka 1
              </th>
              <th className="px-2 py-1 text-center" colSpan={7}>
                Vecka 2
              </th>
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {CYCLE_DAYS.map((d, i) => (
                <th key={d.cycleDay} className="px-2 py-1 text-center font-normal normal-case">
                  <div>{d.label}</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">{dateFormatter.format(nextDates[i])}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{emp.name}</td>
                {CYCLE_DAYS.map((d) => {
                  const assignment = assignmentFor(emp.id, d.cycleDay)
                  const key = `${emp.id}-${d.cycleDay}`
                  return (
                    <td key={d.cycleDay} className={`px-1 py-2 text-center ${d.week === 2 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
                      <select
                        value={assignment?.shiftTemplateId ?? ''}
                        disabled={savingKey === key}
                        onChange={(e) => setCell(emp.id, d.cycleDay, e.target.value || null)}
                        className={`w-full rounded border px-1 py-1 text-xs disabled:opacity-50 ${templateSelectClass(assignment?.shiftTemplate.name)}`}
                      >
                        <option value="">Ledig</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => copyWeek1ToWeek2(emp.id)}
                    title="Kopiera vecka 1:s mönster till vecka 2 (för anställda vars schema inte växlar)"
                    className="whitespace-nowrap text-xs text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Kopiera v1→v2
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga anställda än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
