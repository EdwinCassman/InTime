const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('intime_token')

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error ? JSON.stringify(body.error) : res.statusText, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export type Role = 'ADMIN' | 'EMPLOYEE'

export interface Employee {
  id: string
  name: string
  email: string
  role: Role
  active?: boolean
}

export interface Shift {
  id: string
  userId: string | null // null = open: someone had an approved time-off request and this is up for grabs
  startsAt: string
  endsAt: string
  notes: string | null
  user: { id: string; name: string } | null
  originalUser: { id: string; name: string } | null
  shiftTemplate: ShiftTemplate | null
}

export interface HoursSummary {
  userId: string
  name: string
  hours: number
  simpleOvertimeHours: number
  doubleOvertimeHours: number
}

export type TimeOffRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED'

export interface TimeOffRequest {
  id: string
  userId: string
  shiftId: string | null
  shiftStartsAt: string
  shiftEndsAt: string
  status: TimeOffRequestStatus
  reason: string | null
  createdAt: string
  resolvedAt: string | null
  user?: { id: string; name: string }
}

export type ShiftNoteType = 'INFO' | 'TODO'

export interface ShiftNote {
  id: string
  shiftId: string
  authorId: string
  body: string
  type: ShiftNoteType
  completed: boolean
  completedAt: string | null
  completedBy: { id: string; name: string } | null
  createdAt: string
  author: { id: string; name: string }
  shift: { id: string; userId: string | null; user: { name: string } | null }
}

export type ShiftClaimRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED'

export interface ShiftClaimRequest {
  id: string
  userId: string
  shiftId: string | null
  shiftStartsAt: string
  shiftEndsAt: string
  status: ShiftClaimRequestStatus
  createdAt: string
  resolvedAt: string | null
  user?: { id: string; name: string }
}

export interface ShiftDetail {
  shift: Shift
  coworkers: Shift[]
  canAccessNotes: boolean
  myTimeOffRequest: TimeOffRequest | null
  myClaimRequest: ShiftClaimRequest | null
}

export interface ShiftTemplate {
  id: string
  name: string
  weekdayStart: string
  weekdayEnd: string
  weekdayEndNextDay: boolean
  weekendStart: string
  weekendEnd: string
  weekendEndNextDay: boolean
}

export interface RecurringAssignment {
  id: string
  userId: string
  cycleDay: number // 0-13: position in the repeating 14-day cycle (0 = Monday of week 1)
  shiftTemplateId: string | null
  shiftTemplate: ShiftTemplate | null
  customStartTime: string | null // "HH:mm"
  customEndTime: string | null // "HH:mm"
  customEndNextDay: boolean
}

// Mirrors the weekday/weekend split used by the server's computeShiftTimes.
export function previewShiftTimes(template: ShiftTemplate, weekday: number): { start: string; end: string; endNextDay: boolean } {
  const isWeekend = weekday === 0 || weekday === 6
  return {
    start: isWeekend ? template.weekendStart : template.weekdayStart,
    end: isWeekend ? template.weekendEnd : template.weekdayEnd,
    endNextDay: isWeekend ? template.weekendEndNextDay : template.weekdayEndNextDay,
  }
}

// "cycleDay" (0-13) identifies a slot in an employee's standing 2-week pattern:
// 0-6 = "week 1" (Mon-Sun of an even ISO week number), 7-13 = "week 2" (odd ISO
// week number) — computed fresh from the real calendar every time, so it
// never drifts out of sync with real weeks. Must mirror the server's lib/cycle.ts.
export const CYCLE_LENGTH_DAYS = 14

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function weekdayMonFirst(date: Date): number {
  return (date.getDay() + 6) % 7 // 0 = Monday ... 6 = Sunday
}

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

export function isEvenIsoWeek(date: Date): boolean {
  return isoWeekNumber(date) % 2 === 0
}

export function cycleDayOf(date: Date): number {
  return weekdayMonFirst(date) + (isEvenIsoWeek(date) ? 0 : 7)
}

// The next date (today or later) that falls on the given cycle day.
export function nextDateForCycleDay(cycleDay: number, from: Date = new Date()): Date {
  const today = startOfDay(from)
  for (let i = 0; i < 21; i++) {
    const candidate = new Date(today)
    candidate.setDate(candidate.getDate() + i)
    if (cycleDayOf(candidate) === cycleDay) return candidate
  }
  return today
}
