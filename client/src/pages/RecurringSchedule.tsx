import { useEffect, useMemo, useState } from 'react'
import {
  api,
  isoWeekNumber,
  nextDateForCycleDay,
  type Employee,
  type RecurringAssignment,
  type ShiftTemplate,
} from '../lib/api'
import { templateSelectClass } from '../lib/shiftColors'
import { TimeSelect } from '../components/TimeSelect'

const DAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { month: 'short', day: 'numeric' })

type SlotMode = 'off' | 'template' | 'custom'

interface SlotDraft {
  cycleDay: number
  mode: SlotMode
  shiftTemplateId: string
  customStart: string
  customEnd: string
  customEndNextDay: boolean
}

function emptySlots(): SlotDraft[] {
  return Array.from({ length: 14 }, (_, i) => ({
    cycleDay: i,
    mode: 'off',
    shiftTemplateId: '',
    customStart: '',
    customEnd: '',
    customEndNextDay: false,
  }))
}

function slotsFromAssignments(assignments: RecurringAssignment[]): SlotDraft[] {
  const slots = emptySlots()
  for (const a of assignments) {
    slots[a.cycleDay] = {
      cycleDay: a.cycleDay,
      mode: a.shiftTemplateId ? 'template' : 'custom',
      shiftTemplateId: a.shiftTemplateId ?? '',
      customStart: a.customStartTime ?? '',
      customEnd: a.customEndTime ?? '',
      customEndNextDay: a.customEndNextDay,
    }
  }
  return slots
}

export function RecurringSchedule() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [slots, setSlots] = useState<SlotDraft[]>(emptySlots())
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const nextDates = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 14 }, (_, i) => nextDateForCycleDay(i, now))
  }, [])
  const week1Label = `v.${isoWeekNumber(nextDates[0])}`
  const week2Label = `v.${isoWeekNumber(nextDates[7])}`

  useEffect(() => {
    Promise.all([api.get<Employee[]>('/employees'), api.get<ShiftTemplate[]>('/shift-templates')])
      .then(([emps, tpls]) => {
        setEmployees(emps)
        setTemplates(tpls)
        if (emps.length > 0) setSelectedEmployeeId(emps[0].id)
      })
      .catch(() => setError('Kunde inte ladda anställda och pass.'))
  }, [])

  useEffect(() => {
    if (!selectedEmployeeId) return
    setLoadingSlots(true)
    setMessage(null)
    api
      .get<RecurringAssignment[]>(`/recurring-assignments?userId=${selectedEmployeeId}`)
      .then((assignments) => setSlots(slotsFromAssignments(assignments)))
      .catch(() => setError('Kunde inte ladda schemat för den anställda.'))
      .finally(() => setLoadingSlots(false))
  }, [selectedEmployeeId])

  function updateSlot(cycleDay: number, patch: Partial<SlotDraft>) {
    setSlots((prev) => prev.map((s) => (s.cycleDay === cycleDay ? { ...s, ...patch } : s)))
  }

  function copyWeek1ToWeek2() {
    setSlots((prev) => {
      const next = [...prev]
      for (let i = 0; i < 7; i++) next[i + 7] = { ...prev[i], cycleDay: i + 7 }
      return next
    })
  }

  const hasInvalidCustomSlot = slots.some((s) => s.mode === 'custom' && (!s.customStart || !s.customEnd))

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = slots
        .filter((s) => s.mode !== 'off')
        .map((s) =>
          s.mode === 'template'
            ? { cycleDay: s.cycleDay, shiftTemplateId: s.shiftTemplateId }
            : {
                cycleDay: s.cycleDay,
                customStartTime: s.customStart,
                customEndTime: s.customEnd,
                customEndNextDay: s.customEndNextDay,
              },
        )
      await api.put('/recurring-assignments/bulk', { userId: selectedEmployeeId, slots: payload })
      setMessage('Schemat sparades.')
    } catch {
      setError('Kunde inte spara schemat.')
    } finally {
      setSaving(false)
    }
  }

  async function clearSchedule() {
    const employee = employees.find((e) => e.id === selectedEmployeeId)
    if (!employee) return
    if (
      !confirm(
        `Rensa ${employee.name}s schema? Det återkommande mönstret tas bort, och alla kommande pass (som inte redan har börjat) tas bort. Redan arbetade pass påverkas inte.`,
      )
    )
      return

    setClearing(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.post<{ removedShifts: number }>(`/employees/${selectedEmployeeId}/clear-schedule`)
      setSlots(emptySlots())
      setMessage(`Schemat rensades. ${result.removedShifts} kommande pass togs bort.`)
    } catch {
      setError('Kunde inte rensa schemat.')
    } finally {
      setClearing(false)
    }
  }

  function renderWeek(label: string, weekNumber: string, cycleDayOffset: number) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {label} <span className="font-normal text-slate-400 dark:text-slate-500">({weekNumber})</span>
        </h3>
        <div className="space-y-2">
          {DAY_LABELS.map((dayLabel, i) => {
            const cycleDay = cycleDayOffset + i
            const slot = slots[cycleDay]
            const date = nextDates[cycleDay]
            const selectedTemplateName =
              slot.mode === 'template' ? templates.find((t) => t.id === slot.shiftTemplateId)?.name : undefined
            return (
              <div key={cycleDay} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-700">
                <div className="w-16 shrink-0 text-xs">
                  <div className="font-medium text-slate-700 dark:text-slate-300">{dayLabel}</div>
                  <div className="text-slate-400 dark:text-slate-500">{dateFormatter.format(date)}</div>
                </div>
                <select
                  value={slot.mode === 'off' ? '' : slot.mode === 'custom' ? 'custom' : slot.shiftTemplateId}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') updateSlot(cycleDay, { mode: 'off', shiftTemplateId: '' })
                    else if (value === 'custom') updateSlot(cycleDay, { mode: 'custom', shiftTemplateId: '' })
                    else updateSlot(cycleDay, { mode: 'template', shiftTemplateId: value })
                  }}
                  className={`rounded border px-2 py-1 text-xs ${templateSelectClass(selectedTemplateName)}`}
                >
                  <option value="">Ledig</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="custom">Anpassad tid…</option>
                </select>
                {slot.mode === 'custom' && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <TimeSelect value={slot.customStart} onChange={(v) => updateSlot(cycleDay, { customStart: v })} className="text-xs" />
                    <span className="text-slate-400 dark:text-slate-500">–</span>
                    <TimeSelect value={slot.customEnd} onChange={(v) => updateSlot(cycleDay, { customEnd: v })} className="text-xs" />
                    <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={slot.customEndNextDay}
                        onChange={(e) => updateSlot(cycleDay, { customEndNextDay: e.target.checked })}
                      />
                      nästa dag
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Återkommande schema</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Varje anställds stående mönster över en upprepande 2-veckorscykel — vecka 1 är jämna
          kalenderveckor, vecka 2 är udda. Välj en anställd, ställ in deras mönster och spara.
          Ändringar fyller automatiskt i de kommande veckorna men skriver aldrig över pass som redan
          har genererats.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        >
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={copyWeek1ToWeek2}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Kopiera vecka 1 → vecka 2
        </button>
        <button
          type="button"
          onClick={clearSchedule}
          disabled={clearing || !selectedEmployeeId}
          className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          Rensa schema
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      {loadingSlots ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Laddar…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {renderWeek('Vecka 1', week1Label, 0)}
          {renderWeek('Vecka 2', week2Label, 7)}
        </div>
      )}

      <div className="mt-4">
        {hasInvalidCustomSlot && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Ange både start- och sluttid för alla pass med anpassad tid innan du sparar.
          </p>
        )}
        <button
          onClick={save}
          disabled={saving || loadingSlots || hasInvalidCustomSlot || !selectedEmployeeId}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
        >
          {saving ? 'Sparar…' : 'Spara ändringar'}
        </button>
      </div>
    </div>
  )
}
