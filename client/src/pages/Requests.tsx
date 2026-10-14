import { useEffect, useMemo, useState } from 'react'
import { api, type ShiftClaimRequest, type ShiftClaimRequestStatus, type TimeOffRequest, type TimeOffRequestStatus } from '../lib/api'

const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: false,
})

const STATUS_LABEL: Record<'PENDING' | 'APPROVED' | 'DENIED', string> = {
  PENDING: 'Väntande',
  APPROVED: 'Godkänd',
  DENIED: 'Nekad',
}

const TIME_OFF_STATUS_STYLE: Record<TimeOffRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  DENIED: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
}

const CLAIM_STATUS_STYLE: Record<ShiftClaimRequestStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  DENIED: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
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
      setError('Kunde inte ladda förfrågningar.')
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
      setError('Kunde inte uppdatera förfrågan.')
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
      setError('Kunde inte uppdatera förfrågan.')
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
      <h1 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Förfrågningar</h1>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Lediga pass – anmälningar</h2>
      <div className="mb-6 space-y-3">
        {pendingClaimsByShift.size === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
            Ingen har anmält intresse för ett ledigt pass.
          </div>
        )}
        {Array.from(pendingClaimsByShift.entries()).map(([shiftId, group]) => (
          <div key={shiftId} className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 dark:border-slate-700 dark:bg-amber-500/10 dark:text-amber-300">
              {dateTimeFormatter.format(new Date(group[0].shiftStartsAt))} –{' '}
              {dateTimeFormatter.format(new Date(group[0].shiftEndsAt))}
              {group.length > 1 && (
                <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">{group.length} personer vill ha detta pass</span>
              )}
            </div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {group.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium dark:text-slate-200">{r.user?.name}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => decideClaim(r.id, 'APPROVED')}
                          disabled={busyId === r.id}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Ge passet till {r.user?.name}
                        </button>
                        <button
                          onClick={() => decideClaim(r.id, 'DENIED')}
                          disabled={busyId === r.id}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Neka
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
        <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Anställd</th>
                <th className="px-4 py-2">Pass</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {resolvedClaims.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium dark:text-slate-200">{r.user?.name}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                    {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLAIM_STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        Ledighetsansökningar — väntande ({pendingTimeOff.length})
      </h2>
      <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Anställd</th>
              <th className="px-4 py-2">Pass</th>
              <th className="px-4 py-2">Anledning</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {pendingTimeOff.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium dark:text-slate-200">{r.user?.name}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                  {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.reason ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => decideTimeOff(r.id, 'APPROVED')}
                      disabled={busyId === r.id}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Godkänn
                    </button>
                    <button
                      onClick={() => decideTimeOff(r.id, 'DENIED')}
                      disabled={busyId === r.id}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Neka
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pendingTimeOff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga väntande förfrågningar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Ledighetsansökningar — avgjorda</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Anställd</th>
              <th className="px-4 py-2">Pass</th>
              <th className="px-4 py-2">Anledning</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {resolvedTimeOff.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium dark:text-slate-200">{r.user?.name}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                  {dateTimeFormatter.format(new Date(r.shiftStartsAt))} – {dateTimeFormatter.format(new Date(r.shiftEndsAt))}
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.reason ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIME_OFF_STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
            {resolvedTimeOff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Inga avgjorda förfrågningar än.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
