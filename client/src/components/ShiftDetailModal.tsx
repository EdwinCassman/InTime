import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, type ShiftDetail, type ShiftNote, type ShiftNoteType } from '../lib/api'
import { templateBadgeClass } from '../lib/shiftColors'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const noteTimeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

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
      setError('Could not load this shift.')
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
      setRequestError('Could not submit the request.')
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
      setError('Could not post the note.')
    } finally {
      setNoteBusy(false)
    }
  }

  async function toggleNoteComplete(note: ShiftNote) {
    try {
      await api.patch(`/shifts/${note.shiftId}/notes/${note.id}`, { completed: !note.completed })
      setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
    } catch {
      setError('Could not update that to-do.')
    }
  }

  async function deleteNote(note: ShiftNote) {
    try {
      await api.delete(`/shifts/${note.shiftId}/notes/${note.id}`)
      setNotes(await api.get<ShiftNote[]>(`/shifts/${shiftId}/notes`))
    } catch {
      setError('Could not delete that note.')
    }
  }

  const isOwn = detail?.shift.userId === user?.id
  const isOpen = detail ? detail.shift.userId === null : false
  const canClaim = isOpen && detail?.shift.originalUser?.id !== user?.id
  const hasStarted = detail ? new Date(detail.shift.startsAt) <= new Date() : false

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
      setTimesError('Could not update the times. Times must be on a 15-minute mark (:00, :15, :30, :45).')
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
      setClaimError('Could not request this shift — you may already be working at that time.')
    } finally {
      setClaimBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {detail && (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                {isOpen ? (
                  <h2 className="text-lg font-semibold text-amber-700">
                    Open shift
                    {detail.shift.originalUser && (
                      <span className="ml-1 text-sm font-normal text-slate-400">
                        (was {detail.shift.originalUser.name})
                      </span>
                    )}
                  </h2>
                ) : (
                  <h2 className="text-lg font-semibold text-slate-900">{detail.shift.user?.name}</h2>
                )}
                <p className="text-sm text-slate-500">{dateTimeFormatter.format(new Date(detail.shift.startsAt))}</p>
                <p className="text-sm text-slate-500">
                  {timeFormatter.format(new Date(detail.shift.startsAt))} – {timeFormatter.format(new Date(detail.shift.endsAt))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {detail.shift.shiftTemplate && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${templateBadgeClass(detail.shift.shiftTemplate.name)}`}>
                    {detail.shift.shiftTemplate.name}
                  </span>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                  ✕
                </button>
              </div>
            </div>

            {isOwn && hasStarted && (
              <section className="mb-4 rounded border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase text-slate-500">Actual start/end</h3>
                  {!showTimesForm && (
                    <button
                      onClick={() => setShowTimesForm(true)}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      Adjust
                    </button>
                  )}
                </div>
                {showTimesForm && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-12 text-xs text-slate-500">Start</label>
                      <input
                        type="time"
                        step={900}
                        value={startTimeInput}
                        onChange={(e) => setStartTimeInput(e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-12 text-xs text-slate-500">End</label>
                      <input
                        type="time"
                        step={900}
                        value={endTimeInput}
                        onChange={(e) => setEndTimeInput(e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Times can only be set to :00, :15, :30, or :45.</p>
                    {timesError && <p className="text-xs text-red-600">{timesError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={submitTimeAdjustment}
                        disabled={timesBusy}
                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setShowTimesForm(false)
                          setStartTimeInput(toTimeInputValue(new Date(detail.shift.startsAt)))
                          setEndTimeInput(toTimeInputValue(new Date(detail.shift.endsAt)))
                        }}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {isOpen && (
              <section className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">
                {!canClaim ? (
                  <p className="text-sm text-amber-800">You were approved off this shift, so you can't request it back.</p>
                ) : detail.myClaimRequest?.status === 'PENDING' ? (
                  <p className="text-sm text-amber-800">
                    This shift is up for grabs. Your request is pending — admin will decide if more than one person wants it.
                  </p>
                ) : detail.myClaimRequest?.status === 'APPROVED' ? (
                  <p className="text-sm text-emerald-700">Your request was approved — this shift is now yours.</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-amber-800">
                      This shift is up for grabs. Request it if you're not already working at that time — admin will
                      approve who gets it.
                    </p>
                    {detail.myClaimRequest?.status === 'DENIED' && (
                      <p className="mb-2 text-xs text-red-600">Your previous request for this shift was denied.</p>
                    )}
                    {claimError && <p className="mb-2 text-xs text-red-600">{claimError}</p>}
                    <button
                      onClick={submitClaim}
                      disabled={claimBusy}
                      className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Request this shift
                    </button>
                  </>
                )}
              </section>
            )}

            <section className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Working at the same time</h3>
              {detail.coworkers.length === 0 ? (
                <p className="text-sm text-slate-400">No one else is scheduled during this shift.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.coworkers.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className={c.user ? 'text-slate-700' : 'italic text-amber-700'}>
                        {c.user ? c.user.name : 'Open shift'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {timeFormatter.format(new Date(c.startsAt))} – {timeFormatter.format(new Date(c.endsAt))}
                        {c.shiftTemplate && ` · ${c.shiftTemplate.name}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isOwn && (!hasStarted || detail.myTimeOffRequest) && (
              <section className="mb-4 rounded border border-slate-200 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Time off</h3>
                {detail.myTimeOffRequest?.status === 'PENDING' ? (
                  <p className="text-sm text-amber-700">
                    Request pending{detail.myTimeOffRequest.reason ? `: "${detail.myTimeOffRequest.reason}"` : ''}
                  </p>
                ) : (
                  <>
                    {detail.myTimeOffRequest?.status === 'DENIED' && (
                      <p className="mb-2 text-sm text-red-600">Your previous request was denied.</p>
                    )}
                    {hasStarted ? null : showRequestForm ? (
                      <div className="space-y-2">
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason (optional)"
                          rows={2}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                        {requestError && <p className="text-xs text-red-600">{requestError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={submitRequest}
                            disabled={requestBusy}
                            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            Submit request
                          </button>
                          <button
                            onClick={() => setShowRequestForm(false)}
                            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRequestForm(true)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        Request time off
                      </button>
                    )}
                  </>
                )}
              </section>
            )}

            {detail.canAccessNotes ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Notes for overlapping shifts</h3>
                <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                  {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
                  {notes.map((n) => (
                    <div key={n.id} className="flex gap-2 rounded bg-slate-50 p-2 text-sm">
                      {n.type === 'TODO' && (
                        <input
                          type="checkbox"
                          checked={n.completed}
                          onChange={() => toggleNoteComplete(n)}
                          className="mt-1 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-medium text-slate-700">
                            {n.author.name}
                            {n.shift.id !== detail.shift.id && (
                              <span className="ml-1 font-normal text-slate-400">
                                · on {n.shift.user ? `${n.shift.user.name}'s` : 'an open'} shift
                              </span>
                            )}
                            {n.type === 'TODO' && (
                              <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                                TO-DO
                              </span>
                            )}
                          </span>
                          <span>{noteTimeFormatter.format(new Date(n.createdAt))}</span>
                        </div>
                        <p className={`mt-0.5 whitespace-pre-wrap ${n.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {n.body}
                        </p>
                        {n.completed && n.completedBy && (
                          <p className="mt-0.5 text-[11px] text-emerald-600">
                            Done by {n.completedBy.name}
                            {n.completedAt && ` · ${noteTimeFormatter.format(new Date(n.completedAt))}`}
                          </p>
                        )}
                        {n.authorId === user?.id && (
                          <button
                            onClick={() => deleteNote(n)}
                            className="mt-0.5 text-[11px] text-red-600 hover:underline"
                          >
                            Delete
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
                    className={`rounded px-2 py-1 ${noteType === 'INFO' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteType('TODO')}
                    className={`rounded px-2 py-1 ${noteType === 'TODO' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    To-do
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder={
                      noteType === 'TODO' ? 'Add a task for whoever picks this up…' : "Leave a note for whoever's working this time…"
                    }
                    rows={2}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={submitNote}
                    disabled={noteBusy || !noteBody.trim()}
                    className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </section>
            ) : (
              <p className="text-xs text-slate-400">You don't have access to notes on this shift.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
