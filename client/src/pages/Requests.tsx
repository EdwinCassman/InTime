import { useEffect, useMemo, useState } from 'react'
import { api, type ShiftClaimRequest, type ShiftClaimRequestStatus, type TimeOffRequest, type TimeOffRequestStatus } from '../lib/api'

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const TIME_OFF_STATUS_STYLE: Record<TimeOffRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DENIED: 'bg-red-100 text-red-700',
}

const CLAIM_STATUS_STYLE: Record<ShiftClaimRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DENIED: 'bg-red-100 text-red-700',
}

export function Requests() {
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([])
  const [claimRequests, setClaimRequests] = useState<ShiftClaimRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const [timeOff, claims] = await Promise.all([
        api.get<TimeOffRequest[]>('/time-off-requests'),
        api.get<ShiftClaimRequest[]>('/shift-claim-requests'),
      ])
      setTimeOffRequests(timeOff)
      setClaimRequests(claims)
    } catch {
      setError('Could not load requests.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function decideTimeOff(id: string, status: 'APPROVED' | 'DENIED') {
    setBusyId(id)
    setError(null)
    try {
      await api.patch(`/time-off-requests/${id}`, { status })
      await load()
    } catch {
      setError('Could not update that request.')
    } finally {
      setBusyId(null)
    }
  }

  async function decideClaim(id: string, status: 'APPROVED' | 'DENIED') {
    setBusyId(id)
    setError(null)
    try {
      await api.patch(`/shift-claim-requests/${id}`, { status })
      await load()
    } catch {
      setError('Could not update that request.')
    } finally {
      setBusyId(null)
    }
  }

  const pendingTimeOff = timeOffRequests.filter((r) => r.status === 'PENDING')
  const resolvedTimeOff = timeOffRequests.filter((r) => r.status !== 'PENDING')

  // Group pending claims by shift so competing requests for the same shift show together.
  const pendingClaimsByShift = useMemo(() => {
    const groups = new Map<string, ShiftClaimRequest[]>()
    for (const r of claimRequests.filter((r) => r.status === 'PENDING')) {
      if (!r.shiftId) continue
      const list = groups.get(r.shiftId) ?? []
      list.push(r)
      groups.set(r.shiftId, list)
    }
    return groups
  }, [claimRequests])
  const resolvedClaims = claimRequests.filter((r) => r.status !== 'PENDING')

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Requests</h1>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Open Shift Claims</h2>
      <div className="mb-6 space-y-3">
        {pendingClaimsByShift.size === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
            No one has requested an open shift.
          </div>
        )}
        {Array.from(pendingClaimsByShift.entries()).map(([shiftId, group]) => (
          <div key={shiftId} className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              {dateTimeFormatter.format(new Date(group[0].shiftStartsAt))} –{' '}
              {dateTimeFormatter.format(new Date(group[0].shiftEndsAt))}
              {group.length > 1 && <span className="ml-2 text-xs text-amber-600">{group.length} people want this shift</span>}
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {group.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.user?.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => decideClaim(r.id, 'APPROVED')}
                          disabled={busyId === r.id}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Give shift to {r.user?.name}
                        </button>
                        <button
                          onClick={() => decideClaim(r.id, 'DENIED')}
                          disabled={busyId === r.id}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {resolvedClaims.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Shift</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resolvedClaims.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">{r.user?.name}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLAIM_STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Time Off — Pending ({pendingTimeOff.length})</h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Shift</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pendingTimeOff.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">{r.user?.name}</td>
                <td className="px-4 py-2 text-slate-500">
                  {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                </td>
                <td className="px-4 py-2 text-slate-500">{r.reason ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => decideTimeOff(r.id, 'APPROVED')}
                      disabled={busyId === r.id}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decideTimeOff(r.id, 'DENIED')}
                      disabled={busyId === r.id}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pendingTimeOff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No pending requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Time Off — Resolved</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Shift</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resolvedTimeOff.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">{r.user?.name}</td>
                <td className="px-4 py-2 text-slate-500">
                  {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                </td>
                <td className="px-4 py-2 text-slate-500">{r.reason ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIME_OFF_STATUS_STYLE[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {resolvedTimeOff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No resolved requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
