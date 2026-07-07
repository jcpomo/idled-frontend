'use client'
import { useState } from 'react'
import { useTasks, useMembers } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import TaskDetailPanel from './TaskDetailPanel'
import { COLUMNS } from './Board'

const headerStyle = {
  fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 6px',
} as const
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  padding: '10px 12px', marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
} as const

export default function TaskListView({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const { data: members } = useMembers(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>

  const memberNames: Record<string, string> = {}
  for (const m of members ?? []) memberNames[m.external_id] = m.name ?? m.external_id
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)

  return (
    <>
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        {COLUMNS.map((col) => {
          const rows = byStatus(col.key)
          return (
            <div key={col.key}>
              <div data-testid="group-header" style={headerStyle}>{col.label} · {rows.length}</div>
              {rows.map((t) => (
                <button key={t.id} data-testid="task-row" onClick={() => setSelectedId(t.id)} style={rowStyle}>
                  <span style={{ flex: 1 }}>{t.title}</span>
                  <span style={{ fontSize: 12, color: '#bbb', minWidth: 120 }}>
                    {t.assignee ? (memberNames[t.assignee] ?? t.assignee) : 'Sin asignar'}
                  </span>
                  <span style={{ fontSize: 12, color: '#bbb', minWidth: 90 }}>{t.due_date || '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: '#888', minWidth: 70 }}>{t.task_type}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
      {selectedId && (
        <TaskDetailPanel key={selectedId} taskId={selectedId} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
