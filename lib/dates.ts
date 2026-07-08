// All calendar dates are 'YYYY-MM-DD' strings. Arithmetic goes through UTC
// midnight so day math never drifts across DST or timezone boundaries.

const DAY_MS = 86_400_000

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function toISO(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, n: number): string {
  return toISO(parseISO(iso) + n * DAY_MS)
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS)
}

// Uses the LOCAL calendar date intentionally — todayISO() marks the user's
// wall-clock day for the Gantt "today" line. Do NOT substitute toISO(Date.now()),
// which yields the UTC day and can differ by one near midnight.
export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
