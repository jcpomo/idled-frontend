'use client'
import { useEffect, useRef, useState } from 'react'
import { useTasks, useMembers, useUpdateTask } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import {
  barSpan, computeWindow, barGeometry, applyDrag,
  PX_PER_DAY, DRAG_CLICK_THRESHOLD_PX, type Span, type DragMode,
} from '@/lib/gantt'
import { addDays, diffDays, todayISO, dayLabel } from '@/lib/dates'
import TaskDetailPanel from './TaskDetailPanel'

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: '#6b7280', progress: '#3b82f6', review: '#a855f7', done: '#22c55e',
}
const ROW_H = 34
const LABEL_W = 180

type Drag = { taskId: string; span: Span; mode: DragMode; startX: number; dayDelta: number; moved: boolean }

export default function GanttView({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const { data: members } = useMembers(projectId)
  const update = useUpdateTask(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      setDrag({ ...d, dayDelta: Math.round(dx / PX_PER_DAY), moved: d.moved || Math.abs(dx) >= DRAG_CLICK_THRESHOLD_PX })
    }
    function onUp() {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      if (!d.moved) { setSelectedId(d.taskId); return }
      if (d.dayDelta !== 0) update.mutate({ taskId: d.taskId, patch: applyDrag(d.span, d.mode, d.dayDelta) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, update])

  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>

  const all = tasks ?? []
  if (all.length === 0) return <p style={{ padding: 24, color: '#888' }}>No hay tareas todavía.</p>

  const memberNames: Record<string, string> = {}
  for (const m of members ?? []) memberNames[m.external_id] = m.name ?? m.external_id

  const dated: { task: Task; span: Span }[] = []
  const unscheduled: Task[] = []
  for (const t of all) {
    const span = barSpan(t)
    if (span) dated.push({ task: t, span })
    else unscheduled.push(t)
  }

  const win = dated.length ? computeWindow(dated.map((d) => d.span)) : null
  const today = todayISO()
  const todayInWindow = !!win && diffDays(win.startISO, today) >= 0 && diffDays(today, win.endISO) >= 0
  const gridW = win ? win.days * PX_PER_DAY : 0

  function startDrag(task: Task, span: Span, mode: DragMode, e: React.PointerEvent) {
    e.preventDefault()
    setDrag({ taskId: task.id, span, mode, startX: e.clientX, dayDelta: 0, moved: false })
  }

  return (
    <div style={{ padding: 24, overflowX: 'auto', color: 'var(--text)' }}>
      {win && (
        <div style={{ minWidth: LABEL_W + gridW }}>
          <div data-testid="gantt-axis" style={{ display: 'flex', marginLeft: LABEL_W }}>
            {Array.from({ length: win.days }).map((_, i) => {
              const iso = addDays(win.startISO, i)
              return (
                <div key={iso} style={{ width: PX_PER_DAY, fontSize: 9, color: '#888', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                  {dayLabel(iso)}
                </div>
              )
            })}
          </div>
          <div style={{ position: 'relative' }}>
            {todayInWindow && (
              <div data-testid="gantt-today-line" style={{
                position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.6, background: 'var(--accent)',
                left: LABEL_W + diffDays(win.startISO, today) * PX_PER_DAY,
              }} />
            )}
            {dated.map(({ task, span }) => {
              const active = drag && drag.taskId === task.id && drag.moved ? drag : null
              const shown = active ? (() => {
                const p = applyDrag(span, active.mode, active.dayDelta)
                return { startISO: p.start_date, endISO: p.due_date }
              })() : span
              const geo = barGeometry(shown, win, PX_PER_DAY)
              return (
                <div key={task.id} data-testid="gantt-row" style={{ display: 'flex', alignItems: 'center', height: ROW_H }}>
                  <div style={{ width: LABEL_W, fontSize: 12, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title}
                  </div>
                  <div style={{ position: 'relative', height: ROW_H, flex: 1 }}>
                    <div data-testid="gantt-bar" data-task-id={task.id}
                      onPointerDown={(e) => startDrag(task, span, 'move', e)}
                      style={{
                        position: 'absolute', top: 6, height: ROW_H - 12, left: geo.leftPx, width: geo.widthPx,
                        background: STATUS_COLORS[task.status], borderRadius: 5, cursor: 'grab',
                        display: 'flex', alignItems: 'center', color: '#fff', fontSize: 10, userSelect: 'none',
                      }}>
                      <span data-testid="gantt-resize-start"
                        onPointerDown={(e) => { e.stopPropagation(); startDrag(task, span, 'resize-start', e) }}
                        style={{ width: 8, height: '100%', cursor: 'ew-resize', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', paddingLeft: 2 }}>
                        {task.assignee ? (memberNames[task.assignee] ?? task.assignee) : ''}
                      </span>
                      <span data-testid="gantt-resize-end"
                        onPointerDown={(e) => { e.stopPropagation(); startDrag(task, span, 'resize-end', e) }}
                        style={{ width: 8, height: '100%', cursor: 'ew-resize', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div data-testid="gantt-unscheduled" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Sin programar · {unscheduled.length}</div>
          {unscheduled.map((t) => (
            <button key={t.id} data-testid="gantt-unscheduled-row" onClick={() => setSelectedId(t.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 8, marginBottom: 6,
                background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
              }}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {selectedId && (
        <TaskDetailPanel key={selectedId} taskId={selectedId} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
