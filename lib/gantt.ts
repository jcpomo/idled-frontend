import type { Task } from './types'
import { diffDays, addDays } from './dates'

export const PX_PER_DAY = 28
export const WINDOW_PADDING_DAYS = 1
export const DRAG_CLICK_THRESHOLD_PX = 4

export type Span = { startISO: string; endISO: string }
export type DragMode = 'move' | 'resize-start' | 'resize-end'
export type Window = { startISO: string; endISO: string; days: number }

// Bar span for a task, applying the single-day fallback. Returns null when the
// task has no dates at all (it goes to the "unscheduled" section instead).
export function barSpan(task: Pick<Task, 'start_date' | 'due_date'>): Span | null {
  const s = task.start_date || null
  const e = task.due_date || null
  if (s && e) {
    return diffDays(s, e) < 0 ? { startISO: e, endISO: e } : { startISO: s, endISO: e }
  }
  if (s) return { startISO: s, endISO: s }
  if (e) return { startISO: e, endISO: e }
  return null
}

// Window covering all bars, padded by WINDOW_PADDING_DAYS on each side.
// `spans` must be non-empty.
export function computeWindow(spans: Span[]): Window {
  let minISO = spans[0].startISO
  let maxISO = spans[0].endISO
  for (const sp of spans) {
    if (diffDays(sp.startISO, minISO) > 0) minISO = sp.startISO
    if (diffDays(maxISO, sp.endISO) > 0) maxISO = sp.endISO
  }
  const startISO = addDays(minISO, -WINDOW_PADDING_DAYS)
  const endISO = addDays(maxISO, WINDOW_PADDING_DAYS)
  return { startISO, endISO, days: diffDays(startISO, endISO) + 1 }
}

export function barGeometry(span: Span, win: Window, pxPerDay = PX_PER_DAY): { leftPx: number; widthPx: number } {
  const leftPx = diffDays(win.startISO, span.startISO) * pxPerDay
  const widthPx = (diffDays(span.startISO, span.endISO) + 1) * pxPerDay
  return { leftPx, widthPx }
}

// New {start_date, due_date} after dragging `dayDelta` days. move shifts both
// ends; resize-* moves one end, clamped so start never passes end (and vice versa).
export function applyDrag(span: Span, mode: DragMode, dayDelta: number): { start_date: string; due_date: string } {
  if (mode === 'move') {
    return { start_date: addDays(span.startISO, dayDelta), due_date: addDays(span.endISO, dayDelta) }
  }
  if (mode === 'resize-start') {
    let newStart = addDays(span.startISO, dayDelta)
    if (diffDays(newStart, span.endISO) < 0) newStart = span.endISO
    return { start_date: newStart, due_date: span.endISO }
  }
  let newEnd = addDays(span.endISO, dayDelta)
  if (diffDays(span.startISO, newEnd) < 0) newEnd = span.startISO
  return { start_date: span.startISO, due_date: newEnd }
}
