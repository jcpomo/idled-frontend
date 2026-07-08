import { it, expect } from 'vitest'
import { barSpan, computeWindow, barGeometry, applyDrag, PX_PER_DAY } from '@/lib/gantt'

const task = (start_date: string | null, due_date: string | null) =>
  ({ start_date, due_date })

it('barSpan uses both dates when present', () => {
  expect(barSpan(task('2026-07-05', '2026-07-09'))).toEqual({ startISO: '2026-07-05', endISO: '2026-07-09' })
})

it('barSpan falls back to a single day when one date is missing', () => {
  expect(barSpan(task(null, '2026-07-09'))).toEqual({ startISO: '2026-07-09', endISO: '2026-07-09' })
  expect(barSpan(task('2026-07-05', null))).toEqual({ startISO: '2026-07-05', endISO: '2026-07-05' })
})

it('barSpan collapses to one day when start is after due', () => {
  expect(barSpan(task('2026-07-20', '2026-07-09'))).toEqual({ startISO: '2026-07-09', endISO: '2026-07-09' })
})

it('barSpan returns null when both dates are missing', () => {
  expect(barSpan(task(null, null))).toBeNull()
  expect(barSpan(task('', ''))).toBeNull()
})

it('computeWindow spans min→max with one day of padding each side', () => {
  const win = computeWindow([
    { startISO: '2026-07-05', endISO: '2026-07-07' },
    { startISO: '2026-07-06', endISO: '2026-07-10' },
  ])
  expect(win.startISO).toBe('2026-07-04')
  expect(win.endISO).toBe('2026-07-11')
  expect(win.days).toBe(8)
})

it('barGeometry offsets and sizes a bar within the window', () => {
  const win = { startISO: '2026-07-04', endISO: '2026-07-11', days: 8 }
  const geo = barGeometry({ startISO: '2026-07-05', endISO: '2026-07-07' }, win, PX_PER_DAY)
  expect(geo.leftPx).toBe(1 * PX_PER_DAY)   // one day after window start
  expect(geo.widthPx).toBe(3 * PX_PER_DAY)  // inclusive: 5th,6th,7th
})

it('applyDrag move shifts both ends', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'move', 2))
    .toEqual({ start_date: '2026-07-07', due_date: '2026-07-11' })
})

it('applyDrag resize-start moves start, clamped not to pass end', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-start', 2))
    .toEqual({ start_date: '2026-07-07', due_date: '2026-07-09' })
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-start', 10))
    .toEqual({ start_date: '2026-07-09', due_date: '2026-07-09' })
})

it('applyDrag resize-end moves end, clamped not to pass start', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-end', 2))
    .toEqual({ start_date: '2026-07-05', due_date: '2026-07-11' })
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-end', -10))
    .toEqual({ start_date: '2026-07-05', due_date: '2026-07-05' })
})
