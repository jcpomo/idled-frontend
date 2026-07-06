'use client'
import { useState } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import type { Task, TaskStatus } from '@/lib/types'
import TaskCard from './TaskCard'

function Draggable({ task, onOpen, memberNames }: { task: Task; onOpen: (id: string) => void; memberNames: Record<string, string> }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onOpen(task.id)} style={{ cursor: 'pointer' }}>
      <TaskCard task={task} memberNames={memberNames} />
    </div>
  )
}

export default function Column({
  status, label, tasks, onCreate, onOpen, memberNames,
}: { status: TaskStatus; label: string; tasks: Task[]; onCreate: (title: string) => void; onOpen: (id: string) => void; memberNames: Record<string, string> }) {
  const { setNodeRef } = useDroppable({ id: status })
  const [title, setTitle] = useState('')
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`}
      style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{label}</div>
      {tasks.map((t) => <Draggable key={t.id} task={t} onOpen={onOpen} memberNames={memberNames} />)}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input aria-label={`nueva tarea ${status}`} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="+ tarea"
          style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
        <button onClick={() => { if (title.trim()) { onCreate(title.trim()); setTitle('') } }}
          style={{ padding: '6px 8px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>+</button>
      </div>
    </div>
  )
}
