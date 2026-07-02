'use client'
import { useEffect, useState } from 'react'
import { useUpdateTask, useMoveTask, useDeleteTask, useTasks } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'OPEN' },
  { value: 'progress', label: 'IN PROGRESS' },
  { value: 'review', label: 'REVIEW' },
  { value: 'done', label: 'DONE' },
]

const labelStyle = { fontSize: 11, color: '#888', marginBottom: 4, display: 'block' } as const
const fieldStyle = {
  width: '100%', padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', marginBottom: 14,
} as const

export default function TaskDetailPanel({
  task, projectId, onClose,
}: { task: Task; projectId: string; onClose: () => void }) {
  const update = useUpdateTask(projectId)
  const move = useMoveTask(projectId)
  const del = useDeleteTask(projectId)
  const { data: tasks } = useTasks(projectId)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [taskType, setTaskType] = useState(task.task_type)
  const [assignee, setAssignee] = useState(task.assignee ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function patchIfChanged(field: string, value: string, current: string) {
    if (value !== current) update.mutate({ taskId: task.id, patch: { [field]: value } })
  }

  function onStatusChange(next: TaskStatus) {
    const position = (tasks ?? []).filter((t) => t.status === next).length
    move.mutate({ taskId: task.id, status: next, position })
  }

  function onDelete() {
    del.mutate(task.id)
    onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }}
      />
      <aside
        data-testid="task-detail-panel"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button aria-label="cerrar" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <label htmlFor="td-title" style={labelStyle}>Título</label>
        <input id="td-title" aria-label="título" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => patchIfChanged('title', title, task.title)}
          style={fieldStyle} />

        <label htmlFor="td-desc" style={labelStyle}>Descripción</label>
        <textarea id="td-desc" aria-label="descripción" value={description} rows={4}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => patchIfChanged('description', description, task.description ?? '')}
          style={{ ...fieldStyle, resize: 'vertical' }} />

        <label htmlFor="td-type" style={labelStyle}>Tipo</label>
        <input id="td-type" aria-label="tipo" value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          onBlur={() => patchIfChanged('task_type', taskType, task.task_type)}
          style={fieldStyle} />

        <label htmlFor="td-assignee" style={labelStyle}>Asignado</label>
        <input id="td-assignee" aria-label="asignado" value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          onBlur={() => patchIfChanged('assignee', assignee, task.assignee ?? '')}
          style={fieldStyle} />

        <label htmlFor="td-due" style={labelStyle}>Fecha</label>
        <input id="td-due" aria-label="fecha" type="date" value={dueDate}
          onChange={(e) => { setDueDate(e.target.value); }}
          onBlur={() => patchIfChanged('due_date', dueDate, task.due_date ?? '')}
          style={fieldStyle} />

        <label htmlFor="td-status" style={labelStyle}>Estado</label>
        <select id="td-status" aria-label="estado" value={task.status}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          style={fieldStyle}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          {confirming ? (
            <button onClick={onDelete}
              style={{ width: '100%', padding: 10, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Confirmar borrado
            </button>
          ) : (
            <button onClick={() => setConfirming(true)}
              style={{ width: '100%', padding: 10, background: 'none', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer' }}>
              Eliminar
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
