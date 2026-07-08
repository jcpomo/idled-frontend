import { it, expect } from 'vitest'
import { parseISO, toISO, addDays, diffDays, todayISO, dayLabel } from '@/lib/dates'

it('round-trips ISO through ms', () => {
  expect(toISO(parseISO('2026-07-07'))).toBe('2026-07-07')
})

it('adds days across a month boundary', () => {
  expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})

it('diffs days (b - a), signed', () => {
  expect(diffDays('2026-07-07', '2026-07-10')).toBe(3)
  expect(diffDays('2026-07-10', '2026-07-07')).toBe(-3)
  expect(diffDays('2026-07-07', '2026-07-07')).toBe(0)
})

it('formats a short DD/MM day label', () => {
  expect(dayLabel('2026-07-09')).toBe('09/07')
})

it('todayISO returns a YYYY-MM-DD string', () => {
  expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
