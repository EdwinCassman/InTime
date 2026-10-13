import { useEffect, useMemo, useState } from 'react'
import { api, nextDateForCycleDay, type Employee, type RecurringAssignment, type ShiftTemplate } from '../lib/api'
import { templateSelectClass } from '../lib/shiftColors'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CYCLE_DAYS = Array.from({ length: 14 }, (_, i) => ({
  cycleDay: i,
  week: i < 7 ? 1 : 2,
  label: DAY_LABELS[i % 7],
}))

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

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
      setError('Could not load the recurring schedule.')
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
      setError('Could not save that change.')
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
      setError('Could not copy week 1 to week 2.')
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">Recurring Schedule</h1>
        <p className="text-sm text-slate-500">
          Each employee's standing pattern across a repeating 2-week cycle — use this for rotations
          like 7-on/7-off that differ between week 1 and week 2. The upcoming two weeks are kept
          filled in automatically; deleting a generated shift on the Schedule page (e.g. for sick
          leave) only affects that one day and won't be regenerated.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2" rowSpan={2}>
                Employee
              </th>
              <th className="px-2 py-1 text-center" colSpan={7}>
                Week 1
              </th>
              <th className="px-2 py-1 text-center" colSpan={7}>
                Week 2
              </th>
              <th rowSpan={2}></th>
            </tr>
            <tr>
              {CYCLE_DAYS.map((d, i) => (
                <th key={d.cycleDay} className="px-2 py-1 text-center font-normal normal-case">
                  <div>{d.label}</div>
                  <div className="text-[10px] text-slate-400">{dateFormatter.format(nextDates[i])}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="px-4 py-2 font-medium text-slate-800">{emp.name}</td>
                {CYCLE_DAYS.map((d) => {
                  const assignment = assignmentFor(emp.id, d.cycleDay)
                  const key = `${emp.id}-${d.cycleDay}`
                  return (
                    <td key={d.cycleDay} className={`px-1 py-2 text-center ${d.week === 2 ? 'bg-slate-50/50' : ''}`}>
                      <select
                        value={assignment?.shiftTemplateId ?? ''}
                        disabled={savingKey === key}
                        onChange={(e) => setCell(emp.id, d.cycleDay, e.target.value || null)}
                        className={`w-full rounded border px-1 py-1 text-xs disabled:opacity-50 ${templateSelectClass(assignment?.shiftTemplate.name)}`}
                      >
                        <option value="">Off</option>
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
                    title="Copy week 1's pattern into week 2 (for employees whose schedule doesn't alternate)"
                    className="whitespace-nowrap text-xs text-slate-500 hover:text-slate-800 hover:underline"
                  >
                    Copy wk1→wk2
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-6 text-center text-slate-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
