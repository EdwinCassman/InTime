import type { ShiftTemplate } from './api'

// Tailwind class names must appear literally in source for the JIT scanner to
// pick them up, so this is a lookup table rather than a template-string builder.
interface ColorClasses {
  badge: string
  select: string
}

const TEMPLATE_COLORS: Record<string, ColorClasses> = {
  Öppning: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    select:
      'bg-blue-300 border-blue-500 text-blue-950 font-medium dark:bg-blue-500/30 dark:border-blue-400 dark:text-blue-100',
  },
  Dag: {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    select:
      'bg-emerald-300 border-emerald-500 text-emerald-950 font-medium dark:bg-emerald-500/30 dark:border-emerald-400 dark:text-emerald-100',
  },
  Stängning: {
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300',
    select:
      'bg-yellow-300 border-yellow-500 text-yellow-950 font-medium dark:bg-yellow-500/30 dark:border-yellow-400 dark:text-yellow-100',
  },
}

const FALLBACK_BADGE = 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
const OFF_SELECT = 'bg-white border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300'

export function templateBadgeClass(name: string | null | undefined): string {
  if (!name) return FALLBACK_BADGE
  return TEMPLATE_COLORS[name]?.badge ?? FALLBACK_BADGE
}

export function templateSelectClass(name: string | null | undefined): string {
  if (!name) return OFF_SELECT
  return TEMPLATE_COLORS[name]?.select ?? OFF_SELECT
}

const MAX_MATCH_DIFF_MINUTES = 180

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// A shift isn't always linked to a template row (e.g. a custom-time recurring
// slot, or one adjusted after the fact) — but it may still clearly "be" an
// Opening/Day/Closing shift in spirit. Finds whichever template's start time
// is closest to this shift's actual start, within a generous tolerance, so
// the tag still shows even when the end time (or exact start) doesn't match
// precisely. An explicitly linked template always wins outright.
export function displayTemplateName(
  shift: { startsAt: string; shiftTemplate: { name: string } | null },
  templates: ShiftTemplate[],
): string | null {
  if (shift.shiftTemplate) return shift.shiftTemplate.name
  if (templates.length === 0) return null

  const start = new Date(shift.startsAt)
  const weekday = start.getDay()
  const isWeekend = weekday === 0 || weekday === 6
  const startMinutes = start.getHours() * 60 + start.getMinutes()

  let best: { name: string; diff: number } | null = null
  for (const t of templates) {
    const templateStart = timeToMinutes(isWeekend ? t.weekendStart : t.weekdayStart)
    const diff = Math.abs(templateStart - startMinutes)
    if (!best || diff < best.diff) best = { name: t.name, diff }
  }

  return best && best.diff <= MAX_MATCH_DIFF_MINUTES ? best.name : null
}
