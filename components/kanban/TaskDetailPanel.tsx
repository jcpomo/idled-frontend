'use client'
import { useEffect, useState } from 'react'
import {
  useTask, useSubtasks, useCreateSubtask, useUpdateTask, useMoveTask, useDeleteTask, useTasks, useMembers,
} from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import CommentsSection from './CommentsSection'

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

// Editable fields for one task, seeded from the task and remounted per task via `key`.
function TaskFields({
  task, projectId, onDeleted,
}: { task: Task; projectId: string; onDeleted: () => void }) {
  const update = useUpdateTask(projectId)
  const move = useMoveTask(projectId)
  const del = useDeleteTask(projectId)
  const { data: topTasks } = useTasks(projectId)
  const { data: members } = useMembers(projectId)
  const parentId = task.parent_id ?? undefined

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [taskType, setTaskType] = useState(task.task_type)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [confirming, setConfirming] = useState(false)

  function patchIfChanged(field: string, value: string, current: string) {
    if (value !== current) update.mutate({ taskId: task.id, patch: { [field]: value }, parentId })
  }

  function onStatusChange(next: TaskStatus) {
    if (task.parent_id) {
      update.mutate({ taskId: task.id, patch: { status: next }, parentId })
    } else {
      const position = (topTasks ?? []).filter((t) => t.status === next).length
      move.mutate({ taskId: task.id, status: next, position })
    }
  }

  function onDelete() {
    del.mutate({ taskId: task.id, parentId })
    onDeleted()
  }

  return (
    <>
      <label htmlFor="td-title" style={labelStyle}>Título</label>
      <input id="td-title" aria-label="título" value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => patchIfChanged('title', title, task.title)} style={fieldStyle} />

      <label htmlFor="td-desc" style={labelStyle}>Descripción</label>
      <textarea id="td-desc" aria-label="descripción" value={description} rows={4}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => patchIfChanged('description', description, task.description ?? '')}
        style={{ ...fieldStyle, resize: 'vertical' }} />

      <label htmlFor="td-type" style={labelStyle}>Tipo</label>
      <input id="td-type" aria-label="tipo" value={taskType}
        onChange={(e) => setTaskType(e.target.value)}
        onBlur={() => patchIfChanged('task_type', taskType, task.task_type)} style={fieldStyle} />

      <label htmlFor="td-assignee" style={labelStyle}>Asignado</label>
      <select id="td-assignee" aria-label="asignado" value={task.assignee ?? ''}
        onChange={(e) => update.mutate({ taskId: task.id, patch: { assignee: e.target.value }, parentId })}
        style={fieldStyle}>
        <option value="">Sin asignar</option>
        {task.assignee && !(members ?? []).some((m) => m.external_id === task.assignee) && (
          <option value={task.assignee}>{task.assignee}</option>
        )}
        {(members ?? []).map((m) => (
          <option key={m.external_id} value={m.external_id}>{m.name ?? m.external_id}</option>
        ))}
      </select>

      <label htmlFor="td-due" style={labelStyle}>Fecha</label>
      <input id="td-due" aria-label="fecha" type="date" value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onBlur={() => patchIfChanged('due_date', dueDate, task.due_date ?? '')} style={fieldStyle} />

      <label htmlFor="td-status" style={labelStyle}>Estado</label>
      <select id="td-status" aria-label="estado" value={task.status}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus)} style={fieldStyle}>
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <div style={{ paddingTop: 8 }}>
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
    </>
  )
}

export default function TaskDetailPanel({
  taskId, projectId, onClose,
}: { taskId: string; projectId: string; onClose: () => void }) {
  const [stack, setStack] = useState<{ id: string; title: string | null }[]>([{ id: taskId, title: null }])
  const currentId = stack[stack.length - 1].id
  const { data: current } = useTask(currentId)
  const { data: subtasks } = useSubtasks(currentId)
  const createSub = useCreateSubtask(currentId)
  const [newSub, setNewSub] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the current stack entry's title in sync once the task loads (for breadcrumbs).
  useEffect(() => {
    if (!current) return
    setStack((s) => {
      const top = s[s.length - 1]
      if (top.title === current.title) return s
      const copy = s.slice()
      copy[copy.length - 1] = { id: top.id, title: current.title }
      return copy
    })
  }, [current])

  function openSubtask(sub: Task) { setStack((s) => [...s, { id: sub.id, title: sub.title }]) }
  function popTo(index: number) { setStack((s) => s.slice(0, index + 1)) }
  function onDeleted() { if (stack.length > 1) popTo(stack.length - 2); else onClose() }

  const total = (subtasks ?? []).length
  const done = (subtasks ?? []).filter((t) => t.status === 'done').length

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
      <aside data-testid="task-detail-panel"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
            {stack.map((entry, i) => (
              <span key={entry.id}>
                {i > 0 && <span style={{ color: '#666' }}> › </span>}
                {i < stack.length - 1 ? (
                  <button aria-label={`volver a ${entry.title ?? ''}`} onClick={() => popTo(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    {entry.title ?? '…'}
                  </button>
                ) : (
                  <span style={{ color: 'var(--text)' }}>{current?.title ?? '…'}</span>
                )}
              </span>
            ))}
          </div>
          <button aria-label="cerrar" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {current ? (
          <TaskFields key={current.id} task={current} projectId={projectId} onDeleted={onDeleted} />
        ) : (
          <p style={{ color: 'var(--text)' }}>Cargando…</p>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={labelStyle}>Subtareas</span>
            <span data-testid="subtask-progress" style={{ fontSize: 11, color: '#888' }}>{done}/{total}</span>
          </div>
          {(subtasks ?? []).map((s) => (
            <button key={s.id} data-testid="subtask-item" onClick={() => openSubtask(s)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                padding: 8, marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
              }}>
              <span>{s.title}</span>
              <span className="mono" style={{ fontSize: 10, color: '#888' }}>{s.status}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input aria-label="nueva subtarea" value={newSub} onChange={(e) => setNewSub(e.target.value)}
              placeholder="+ subtarea"
              style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
            <button aria-label="crear subtarea"
              onClick={() => { if (newSub.trim()) { createSub.mutate({ title: newSub.trim() }); setNewSub('') } }}
              style={{ padding: '6px 8px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>+</button>
          </div>
        </div>

        {current && <CommentsSection key={`comments-${current.id}`} taskId={current.id} />}
      </aside>
    </>
  )
}
