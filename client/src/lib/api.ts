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
  shiftTemplateId: string
  shiftTemplate: ShiftTemplate
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

export const CYCLE_LENGTH_DAYS = 14
const CYCLE_ANCHOR = new Date(2024, 0, 1) // Monday — must match the server's lib/cycle.ts

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function cycleDayOf(date: Date): number {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(CYCLE_ANCHOR).getTime()) / (1000 * 60 * 60 * 24),
  )
  return ((diffDays % CYCLE_LENGTH_DAYS) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS
}

// The next date (today or later) that falls on the given cycle day.
export function nextDateForCycleDay(cycleDay: number, from: Date = new Date()): Date {
  const today = startOfDay(from)
  const diff = (cycleDay - cycleDayOf(today) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS
  const result = new Date(today)
  result.setDate(result.getDate() + diff)
  return result
}
