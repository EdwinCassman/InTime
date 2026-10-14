import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, type ShiftDetail, type ShiftNote, type ShiftNoteType, type ShiftTemplate } from '../lib/api'
import { displayTemplateName, templateBadgeClass } from '../lib/shiftColors'
import { TimeSelect } from './TimeSelect'

const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', minute: '2-digit', hour12: false })
const noteTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

function toTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Keeps the original date, swaps in the new HH:mm.
function combineDateAndTime(originalIso: string, hhmm: string): Date {
  const original = new Date(originalIso)
  const [hours, minutes] = hhmm.split(':').map(Number)
  const result = new Date(original)
  result.setHours(hours, minutes, 0, 0)
  return result
}

export function ShiftDetailModal({ shiftId, onClose, onChanged }: { shiftId: string; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<ShiftDetail | null>(null)
  const [notes, setNotes] = useState<ShiftNote[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [showRequestForm, setShowRequestForm] = useState(false)
  const [reason, setReason] = useState('')
  const [requestBusy, setRequestBusy] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const [noteBody, setNoteBody] = useState('')
  const [noteType, setNoteType] = useState<ShiftNoteType>('INFO')
  const [noteBusy, setNoteBusy] = useState(false)

  const [claimBusy, setClaimBusy] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  const [showTimesForm, setShowTimesForm] = useState(false)
  const [startTimeInput, setStartTimeInput] = useState('')
  const [endTimeInput, setEndTimeInput] = useState('')
  const [timesBusy, setTimesBusy] = useState(false)
  const [timesError, setTimesError] = useState<string | null>(null)

  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  useEffect(() => {
    api.get<ShiftTemplate[]>('/shift-templates').then(setTemplates).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const d = await api.get<ShiftDetail>(`/shifts/${shiftId}`)
      setDetail(d)
      setStartTimeInput(toTimeInputValue(new Date(d.shift.startsAt)))
      setEndTimeInput(toTimeInputValue(new Date(d.shift.endsAt)))
      if (d.canAccessNotes) {
        setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
      }
    } catch {
      setError('Kunde inte ladda passet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId])

  async function submitRequest() {
    setRequestBusy(true)
    setRequestError(null)
    try {
      await api.post(`/shifts/${shiftId}/time-off-requests`, { reason: reason || undefined })
      setShowRequestForm(false)
      setReason('')
      await load()
      onChanged()
    } catch {
      setRequestError('Kunde inte skicka förfrågan.')
    } finally {
      setRequestBusy(false)
    }
  }

  async function submitNote() {
    if (!noteBody.trim()) return
    setNoteBusy(true)
    try {
      await api.post(`/shifts/${shiftId}/notes`, { body: noteBody.trim(), type: noteType })
      setNoteBody('')
      setNoteType('INFO')
      setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
    } catch {
      setError('Kunde inte skicka anteckningen.')
    } finally {
      setNoteBusy(false)
    }
  }

  async function toggleNoteComplete(note: ShiftNote) {
    try {
      await api.patch(`/shifts/${note.shiftId}/notes/${note.id}`, { completed: !note.completed })
      setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
    } catch {
      setError('Kunde inte uppdatera uppgiften.')
    }
  }

  async function deleteNote(note: ShiftNote) {
    try {
      await api.delete(`/shifts/${note.shiftId}/notes/${note.id}`)
      setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
    } catch {
      setError('Kunde inte ta bort anteckningen.')
    }
  }

  const isOwn = detail?.shift.userId === user?.id
  const isOpen = detail ? detail.shift.userId === null : false
  const canClaim = isOpen && detail?.shift.originalUser?.id !== user?.id
  const hasStarted = detail ? new Date(detail.shift.startsAt) <= new Date() : false
  const shiftTagName = detail ? displayTemplateName(detail.shift, templates) : null

  async function submitTimeAdjustment() {
    if (!detail) return
    setTimesBusy(true)
    setTimesError(null)
    try {
      const startsAt = combineDateAndTime(detail.shift.startsAt, startTimeInput)
      const endsAt = combineDateAndTime(detail.shift.endsAt, endTimeInput)
      await api.patch(`/shifts/${shiftId}/times`, { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })
      setShowTimesForm(false)
      await load()
      onChanged()
    } catch {
      setTimesError('Kunde inte uppdatera tiderna. Tiderna måste vara på en 15-minutersgräns (:00, :15, :30, :45).')
    } finally {
      setTimesBusy(false)
    }
  }

  async function submitClaim() {
    setClaimBusy(true)
    setClaimError(null)
    try {
      await api.post(`/shifts/${shiftId}/claim`)
      await load()
      onChanged()
    } catch {
      setClaimError('Kunde inte anmäla intresse för passet — du kanske redan jobbar vid den tiden.')
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Laddar…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {detail && (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                {isOpen ? (
                  <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                    Ledigt pass
                    {detail.shift.originalUser && (
                      <span className="ml-1 text-sm font-normal text-slate-400 dark:text-slate-500">
                        (var {detail.shift.originalUser.name})
                      </span>
                    )}
                  </h2>
                ) : (
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{detail.shift.user?.name}</h2>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-400">{dateTimeFormatter.format(new Date(detail.shift.startsAt))}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {timeFormatter.format(new Date(detail.shift.startsAt))} – {timeFormatter.format(new Date(detail.shift.endsAt))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {shiftTagName && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${templateBadgeClass(shiftTagName)}`}>
                    {shiftTagName}
                  </span>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300" aria-label="Stäng">
                  ✕
                </button>
              </div>
            </div>

            {isOwn && hasStarted && (
              <section className="mb-4 rounded border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Faktisk start/slut</h3>
                  {!showTimesForm && (
                    <button
                      onClick={() => setShowTimesForm(true)}
                      className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-300"
                    >
                      Justera
                    </button>
                  )}
                </div>
                {showTimesForm && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-12 text-xs text-slate-500 dark:text-slate-400">Start</label>
                      <TimeSelect value={startTimeInput} onChange={setStartTimeInput} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-12 text-xs text-slate-500 dark:text-slate-400">Slut</label>
                      <TimeSelect value={endTimeInput} onChange={setEndTimeInput} />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Tider kan bara ställas in på :00, :15, :30 eller :45.
                    </p>
                    {timesError && <p className="text-xs text-red-600 dark:text-red-400">{timesError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={submitTimeAdjustment}
                        disabled={timesBusy}
                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
                      >
                        Spara
                      </button>
                      <button
                        onClick={() => {
                          setShowTimesForm(false)
                          setStartTimeInput(toTimeInputValue(new Date(detail.shift.startsAt)))
                          setEndTimeInput(toTimeInputValue(new Date(detail.shift.endsAt)))
                        }}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {isOpen && (
              <section className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                {!canClaim ? (
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Du blev godkänd ledig från detta pass, så du kan inte begära tillbaka det.
                  </p>
                ) : detail.myClaimRequest?.status === 'PENDING' ? (
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Detta pass är ledigt. Din förfrågan väntar på godkännande — admin avgör om fler än en person vill ha det.
                  </p>
                ) : detail.myClaimRequest?.status === 'APPROVED' ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">Din förfrågan godkändes — passet är nu ditt.</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-amber-800 dark:text-amber-300">
                      Detta pass är ledigt. Anmäl intresse om du inte redan jobbar vid den tiden — admin avgör vem som
                      får det.
                    </p>
                    {detail.myClaimRequest?.status === 'DENIED' && (
                      <p className="mb-2 text-xs text-red-600 dark:text-red-400">Din tidigare förfrågan för detta pass nekades.</p>
                    )}
                    {claimError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{claimError}</p>}
                    <button
                      onClick={submitClaim}
                      disabled={claimBusy}
                      className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Anmäl intresse
                    </button>
                  </>
                )}
              </section>
            )}

            <section className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Jobbar samtidigt</h3>
              {detail.coworkers.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Ingen annan är schemalagd under detta pass.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.coworkers.map((c) => {
                    const coworkerTagName = displayTemplateName(c, templates)
                    return (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className={c.user ? 'text-slate-700 dark:text-slate-300' : 'italic text-amber-700 dark:text-amber-400'}>
                        {c.user ? c.user.name : 'Ledigt pass'}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {timeFormatter.format(new Date(c.startsAt))} – {timeFormatter.format(new Date(c.endsAt))}
                        {coworkerTagName && ` · ${coworkerTagName}`}
                      </span>
                    </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {isOwn && (!hasStarted || detail.myTimeOffRequest) && (
              <section className="mb-4 rounded border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Ledighet</h3>
                {detail.myTimeOffRequest?.status === 'PENDING' ? (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Förfrågan väntar{detail.myTimeOffRequest.reason ? `: "${detail.myTimeOffRequest.reason}"` : ''}
                  </p>
                ) : (
                  <>
                    {detail.myTimeOffRequest?.status === 'DENIED' && (
                      <p className="mb-2 text-sm text-red-600 dark:text-red-400">Din tidigare förfrågan nekades.</p>
                    )}
                    {hasStarted ? null : showRequestForm ? (
                      <div className="space-y-2">
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Anledning (valfritt)"
                          rows={2}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        />
                        {requestError && <p className="text-xs text-red-600 dark:text-red-400">{requestError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={submitRequest}
                            disabled={requestBusy}
                            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
                          >
                            Skicka förfrågan
                          </button>
                          <button
                            onClick={() => setShowRequestForm(false)}
                            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRequestForm(true)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                      >
                        Ansök om ledighet
                      </button>
                    )}
                  </>
                )}
              </section>
            )}

            {detail.canAccessNotes ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Anteckningar för överlappande pass</h3>
                <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                  {notes.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Inga anteckningar än.</p>}
                  {notes.map((n) => (
                    <div key={n.id} className="flex gap-2 rounded bg-slate-50 p-2 text-sm dark:bg-slate-700/50">
                      {n.type === 'TODO' && (
                        <input
                          type="checkbox"
                          checked={n.completed}
                          onChange={() => toggleNoteComplete(n)}
                          className="mt-1 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {n.author.name}
                            {n.shift.id !== detail.shift.id && (
                              <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                                · på {n.shift.user ? `${n.shift.user.name}s` : 'ett ledigt'} pass
                              </span>
                            )}
                            {n.type === 'TODO' && (
                              <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                                ATT GÖRA
                              </span>
                            )}
                          </span>
                          <span>{noteTimeFormatter.format(new Date(n.createdAt))}</span>
                        </div>
                        <p className={`mt-0.5 whitespace-pre-wrap ${n.completed ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                          {n.body}
                        </p>
                        {n.completed && n.completedBy && (
                          <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                            Klart av {n.completedBy.name}
                            {n.completedAt && ` · ${noteTimeFormatter.format(new Date(n.completedAt))}`}
                          </p>
                        )}
                        {n.authorId === user?.id && (
                          <button
                            onClick={() => deleteNote(n)}
                            className="mt-0.5 text-[11px] text-red-600 hover:underline dark:text-red-400"
                          >
                            Ta bort
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setNoteType('INFO')}
                    className={`rounded px-2 py-1 ${noteType === 'INFO' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteType('TODO')}
                    className={`rounded px-2 py-1 ${noteType === 'TODO' ? 'bg-slate-900 text-white dark:bg-slate-600' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                  >
                    Att göra
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder={
                      noteType === 'TODO' ? 'Lägg till en uppgift för den som tar passet…' : 'Lämna en anteckning till den som jobbar då…'
                    }
                    rows={2}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                  <button
                    onClick={submitNote}
                    disabled={noteBusy || !noteBody.trim()}
                    className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
                  >
                    Skicka
                  </button>
                </div>
              </section>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">Du har inte tillgång till anteckningar för detta pass.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
