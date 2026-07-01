'use client'
import { useTasks } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import TaskCard from './TaskCard'

export const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'open', label: 'OPEN' },
  { key: 'progress', label: 'IN PROGRESS' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
]

export default function Board({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)
  return (
    <div style={{ display: 'flex', gap: 14, padding: 24, height: '100%', overflowX: 'auto' }}>
      {COLUMNS.map((col) => (
        <div key={col.key} data-testid={`column-${col.key}`}
          style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{col.label}</div>
          {byStatus(col.key).map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      ))}
    </div>
  )
}
