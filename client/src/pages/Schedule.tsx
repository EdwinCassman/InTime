import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ShiftDetailModal } from '../components/ShiftDetailModal'
import { TimeSelect } from '../components/TimeSelect'
import { useAuth } from '../context/AuthContext'
import { api, previewShiftTimes, type Employee, type Shift, type ShiftTemplate } from '../lib/api'
import { displayTemplateName, templateBadgeClass } from '../lib/shiftColors'

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday as start of week
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toLocalTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toLocalDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const dayFormatter = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', month: 'short', day: 'numeric' })
const columnHeaderFormatter = new Intl.DateTimeFormat('sv-SE', { weekday: 'short' })
const columnDateFormatter = new Intl.DateTimeFormat('sv-SE', { month: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', minute: '2-digit', hour12: false })

export function Schedule() {
  const { user } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  async function loadShifts() {
    setError(null)
    try {
      const data = await api.get<Shift[]>(
        `/shifts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
      )
      setShifts(data)
    } catch {
      setError('Kunde inte ladda schemat.')
    }
  }

  async function clearEmployeeSchedule(employeeId: string, employeeName: string) {
    if (
      !confirm(
        `Rensa ${employeeName}s schema? Det återkommande mönstret tas bort, och alla kommande pass (som inte redan har börjat) tas bort. Redan arbetade pass påverkas inte.`,
      )
    )
      return
    try {
      const result = await api.post<{ removedShifts: number }>(`/employees/${employeeId}/clear-schedule`)
      alert(`${result.removedShifts} kommande pass togs bort.`)
      loadShifts()
    } catch {
      setError('Kunde inte rensa schemat.')
    }
  }

  useEffect(() => {
    loadShifts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  useEffect(() => {
    api.get<Employee[]>('/employees').then(setEmployees).catch(() => {})
    api.get<ShiftTemplate[]>('/shift-templates').then(setTemplates).catch(() => {})
  }, [user])

  // "Me" row first (even if that account isn't in the fetched list yet), everyone else after.
  // Admin accounts don't work shifts, so they don't get a row here.
  const orderedEmployees = useMemo(() => {
    const scheduledEmployees = employees.filter((e) => e.role !== 'ADMIN')
    const mine = scheduledEmployees.filter((e) => e.id === user?.id)
    const others = scheduledEmployees.filter((e) => e.id !== user?.id)
    return [...mine, ...others]
  }, [employees, user])

  const today = new Date()

  function shiftsFor(userId: string, day: Date): Shift[] {
    const dayEnd = addDays(day, 1)
    return shifts
      .filter((s) => s.userId === userId && new Date(s.startsAt) >= day && new Date(s.startsAt) < dayEnd)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }

  // Shifts this employee was approved off of, still open (not yet claimed by
  // someone else) — shown greyed-out in their row as a reminder, in addition
  // to appearing in the Open Shifts row below.
  function approvedOffShiftsFor(userId: string, day: Date): Shift[] {
    const dayEnd = addDays(day, 1)
    return shifts
      .filter(
        (s) =>
          s.userId === null &&
          s.originalUser?.id === userId &&
          new Date(s.startsAt) >= day &&
          new Date(s.startsAt) < dayEnd,
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }

  function openShiftsFor(day: Date): Shift[] {
    const dayEnd = addDays(day, 1)
    return shifts
      .filter((s) => s.userId === null && new Date(s.startsAt) >= day && new Date(s.startsAt) < dayEnd)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            ← Föreg.
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {dayFormatter.format(weekStart)} – {dayFormatter.format(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Nästa →
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Idag
          </button>
        </div>
        {user?.role === 'ADMIN' && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {showForm ? 'Stäng' : '+ Lägg till pass'}
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {showForm && user?.role === 'ADMIN' && (
        <ShiftForm
          employees={employees}
          templates={templates}
          defaultStart={weekStart}
          onCreated={() => {
            setShowForm(false)
            loadShifts()
          }}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 dark:bg-slate-900/40">Anställd</th>
              {days.map((day) => {
                const isToday = isSameDay(day, today)
                return (
                  <th
                    key={day.toISOString()}
                    className={`px-2 py-2 text-center font-normal normal-case ${isToday ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : ''}`}
                  >
                    <div className="font-medium uppercase">{columnHeaderFormatter.format(day)}</div>
                    <div className={isToday ? 'text-[10px] text-indigo-500 dark:text-indigo-400' : 'text-[10px] text-slate-400 dark:text-slate-500'}>
                      {columnDateFormatter.format(day)}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {orderedEmployees.map((emp) => {
              const isMe = emp.id === user?.id
              return (
                <tr key={emp.id} className={isMe ? 'bg-emerald-50/60 dark:bg-emerald-500/10' : undefined}>
                  <td
                    className={`sticky left-0 z-10 px-4 py-2 font-medium ${
                      isMe
                        ? 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {emp.name}
                        {isMe && <span className="ml-1 text-xs font-normal text-emerald-600 dark:text-emerald-400">(du)</span>}
                      </span>
                      {user?.role === 'ADMIN' && (
                        <button
                          onClick={() => clearEmployeeSchedule(emp.id, emp.name)}
                          title="Rensa återkommande mönster och alla kommande pass"
                          className="text-[10px] font-normal text-red-500 hover:underline dark:text-red-400"
                        >
                          Rensa
                        </button>
                      )}
                    </div>
                  </td>
                  {days.map((day) => {
                    const dayShifts = shiftsFor(emp.id, day)
                    const approvedOffShifts = approvedOffShiftsFor(emp.id, day)
                    const isToday = isSameDay(day, today)
                    return (
                      <td
                        key={day.toISOString()}
                        className={`px-2 py-2 align-top ${isToday ? 'ring-1 ring-inset ring-indigo-300 dark:ring-indigo-500/40' : ''} ${
                          isToday && !isMe ? 'bg-indigo-50/50 dark:bg-indigo-500/10' : ''
                        }`}
                      >
                        {dayShifts.length === 0 && approvedOffShifts.length === 0 ? (
                          <span className="block text-center text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <div className="space-y-1">
                            {dayShifts.map((shift) => {
                              const tagName = displayTemplateName(shift, templates)
                              return (
                              <div
                                key={shift.id}
                                onClick={() => setSelectedShiftId(shift.id)}
                                className={`cursor-pointer rounded p-1.5 text-xs hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500 ${isMe ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-slate-50 dark:bg-slate-700/60'}`}
                              >
                                {tagName && (
                                  <span className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${templateBadgeClass(tagName)}`}>
                                    {tagName}
                                  </span>
                                )}
                                <div className="text-slate-600 dark:text-slate-300">
                                  {timeFormatter.format(new Date(shift.startsAt))} – {timeFormatter.format(new Date(shift.endsAt))}
                                </div>
                                {shift.notes && <div className="text-slate-500 dark:text-slate-400">{shift.notes}</div>}
                                {user?.role === 'ADMIN' && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      await api.delete(`/shifts/${shift.id}`)
                                      loadShifts()
                                    }}
                                    className="text-red-600 hover:underline dark:text-red-400"
                                  >
                                    Ta bort
                                  </button>
                                )}
                              </div>
                              )
                            })}
                            {approvedOffShifts.map((shift) => (
                              <div
                                key={shift.id}
                                onClick={() => setSelectedShiftId(shift.id)}
                                className="cursor-pointer rounded border border-dashed border-slate-300 bg-slate-100 p-1.5 text-xs text-slate-400 hover:ring-1 hover:ring-slate-400 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-500 dark:hover:ring-slate-500"
                              >
                                <div>
                                  {timeFormatter.format(new Date(shift.startsAt))} – {timeFormatter.format(new Date(shift.endsAt))}
                                </div>
                                <div className="italic">Ledig (godkänd)</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {orderedEmployees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga anställda än.
                </td>
              </tr>
            )}
            {shifts.some((s) => s.userId === null) && (
              <tr className="border-t-2 border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/10">
                <td className="sticky left-0 z-10 bg-amber-50/40 px-4 py-2 font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  Lediga pass
                </td>
                {days.map((day) => {
                  const dayOpenShifts = openShiftsFor(day)
                  return (
                    <td key={day.toISOString()} className="px-2 py-2 align-top">
                      {dayOpenShifts.length === 0 ? (
                        <span className="block text-center text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <div className="space-y-1">
                          {dayOpenShifts.map((shift) => {
                            const tagName = displayTemplateName(shift, templates)
                            return (
                            <div
                              key={shift.id}
                              onClick={() => setSelectedShiftId(shift.id)}
                              className="cursor-pointer rounded border border-dashed border-amber-400 bg-amber-100 p-1.5 text-xs hover:ring-1 hover:ring-amber-500 dark:border-amber-500/50 dark:bg-amber-500/20"
                            >
                              {tagName && (
                                <span className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${templateBadgeClass(tagName)}`}>
                                  {tagName}
                                </span>
                              )}
                              <div className="text-amber-800 dark:text-amber-200">
                                {timeFormatter.format(new Date(shift.startsAt))} – {timeFormatter.format(new Date(shift.endsAt))}
                              </div>
                              {shift.originalUser && (
                                <div className="text-amber-600 dark:text-amber-400">var {shift.originalUser.name}</div>
                              )}
                              {user?.role === 'ADMIN' && (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    await api.delete(`/shifts/${shift.id}`)
                                    loadShifts()
                                  }}
                                  className="text-red-600 hover:underline dark:text-red-400"
                                >
                                  Ta bort
                                </button>
                              )}
                            </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedShiftId && (
        <ShiftDetailModal
          shiftId={selectedShiftId}
          onClose={() => setSelectedShiftId(null)}
          onChanged={loadShifts}
        />
      )}
    </div>
  )
}

function ShiftForm({
  employees,
  templates,
  defaultStart,
  onCreated,
}: {
  employees: Employee[]
  templates: ShiftTemplate[]
  defaultStart: Date
  onCreated: () => void
}) {
  const [mode, setMode] = useState<'standard' | 'custom'>('standard')
  const [userId, setUserId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Standard-shift fields
  const [date, setDate] = useState(toLocalDateValue(defaultStart))
  const [shiftTemplateId, setShiftTemplateId] = useState('')

  // Custom-time fields
  const [customStartDate, setCustomStartDate] = useState(toLocalDateValue(defaultStart))
  const [customStartTime, setCustomStartTime] = useState(toLocalTimeValue(defaultStart))
  const [customEndDate, setCustomEndDate] = useState(toLocalDateValue(defaultStart))
  const [customEndTime, setCustomEndTime] = useState(toLocalTimeValue(defaultStart))

  const selectedTemplate = templates.find((t) => t.id === shiftTemplateId)
  const preview = useMemo(() => {
    if (!selectedTemplate || !date) return null
    const [year, month, day] = date.split('-').map(Number)
    const weekday = new Date(year, month - 1, day).getDay()
    return previewShiftTimes(selectedTemplate, weekday)
  }, [selectedTemplate, date])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'standard') {
        await api.post('/shifts', { userId, date, shiftTemplateId, notes: notes || undefined })
      } else {
        await api.post('/shifts', {
          userId,
          startsAt: new Date(`${customStartDate}T${customStartTime}`).toISOString(),
          endsAt: new Date(`${customEndDate}T${customEndTime}`).toISOString(),
          notes: notes || undefined,
        })
      }
      onCreated()
    } catch {
      setError('Kunde inte skapa passet. Kontrollera anställd, datum och tider.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode('standard')}
          className={`rounded px-2 py-1 ${mode === 'standard' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
        >
          Standardpass
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`rounded px-2 py-1 ${mode === 'custom' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
        >
          Anpassade tider
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Anställd</label>
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          >
            <option value="">Välj…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        {mode === 'standard' ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Datum</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Pass</label>
              <select
                required
                value={shiftTemplateId}
                onChange={(e) => setShiftTemplateId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                <option value="">Välj…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Tider</label>
              <p className="rounded border border-dashed border-slate-300 px-2 py-1.5 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                {preview ? `${preview.start} – ${preview.end}${preview.endNextDay ? ' (+1 dag)' : ''}` : '—'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Start</label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  required
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
                <TimeSelect value={customStartTime} onChange={setCustomStartTime} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Slut</label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  required
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
                <TimeSelect value={customEndTime} onChange={setCustomEndTime} />
              </div>
            </div>
          </>
        )}

        <div className={mode === 'standard' ? 'sm:col-span-4' : 'sm:col-span-2'}>
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Anteckningar</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-4 dark:text-red-400">{error}</p>}

        <div className="sm:col-span-4">
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Spara pass
          </button>
        </div>
      </div>
    </form>
  )
}
