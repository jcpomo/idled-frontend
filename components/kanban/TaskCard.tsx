'use client'
import type { Task } from '@/lib/types'

export default function TaskCard({ task, memberNames }: { task: Task; memberNames: Record<string, string> }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, color: 'var(--text)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{task.title}</div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#bbb' }}>
        <span className="mono">{task.task_type}</span>
        {task.assignee && <span>· {memberNames[task.assignee] ?? task.assignee}</span>}
        {task.due_date && <span>· {task.due_date}</span>}
      </div>
    </div>
  )
}
