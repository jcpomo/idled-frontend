'use client'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useTasks, useCreateTask, useMoveTask } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import Column from './Column'

export const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'open', label: 'OPEN' },
  { key: 'progress', label: 'IN PROGRESS' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
]

const COLUMN_KEYS: TaskStatus[] = ['open', 'progress', 'review', 'done']

export function resolveMove(
  activeId: string,
  overId: string | null,
  tasks: Task[],
): { taskId: string; status: TaskStatus; position: number } | null {
  if (!overId || !COLUMN_KEYS.includes(overId as TaskStatus)) return null
  const status = overId as TaskStatus
  const position = tasks.filter((t) => t.status === status).length
  return { taskId: activeId, status, position }
}

export default function Board({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const create = useCreateTask(projectId)
  const move = useMoveTask(projectId)
  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)
  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : null
    const plan = resolveMove(String(e.active.id), over, tasks ?? [])
    if (plan) move.mutate(plan)
  }
  function createForColumn(status: TaskStatus, title: string) {
    create.mutate({ title, status })
  }
  return (
    <DndContext onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: 14, padding: 24, height: '100%', overflowX: 'auto' }}>
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            status={col.key}
            label={col.label}
            tasks={byStatus(col.key)}
            onCreate={(title) => createForColumn(col.key, title)}
          />
        ))}
      </div>
    </DndContext>
  )
}
