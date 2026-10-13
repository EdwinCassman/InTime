// Tailwind class names must appear literally in source for the JIT scanner to
// pick them up, so this is a lookup table rather than a template-string builder.
interface ColorClasses {
  badge: string
  select: string
}

const TEMPLATE_COLORS: Record<string, ColorClasses> = {
  Opening: {
    badge: 'bg-blue-100 text-blue-700',
    select: 'bg-blue-300 border-blue-500 text-blue-950 font-medium',
  },
  Day: {
    badge: 'bg-emerald-100 text-emerald-700',
    select: 'bg-emerald-300 border-emerald-500 text-emerald-950 font-medium',
  },
  Closing: {
    badge: 'bg-yellow-100 text-yellow-800',
    select: 'bg-yellow-300 border-yellow-500 text-yellow-950 font-medium',
  },
}

const FALLBACK_BADGE = 'bg-slate-200 text-slate-600'
const OFF_SELECT = 'bg-white border-slate-300 text-slate-600'

export function templateBadgeClass(name: string | null | undefined): string {
  if (!name) return FALLBACK_BADGE
  return TEMPLATE_COLORS[name]?.badge ?? FALLBACK_BADGE
}

export function templateSelectClass(name: string | null | undefined): string {
  if (!name) return OFF_SELECT
  return TEMPLATE_COLORS[name]?.select ?? OFF_SELECT
}
