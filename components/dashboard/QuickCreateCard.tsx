'use client'
import { useState } from 'react'
import { useProjects, useTaskTypes, useQuickCreateTask } from '@/lib/queries'
import type { Project, TaskType } from '@/lib/types'

export default function QuickCreateCard() {
  const { data: projectsData } = useProjects()
  const { data: typesData } = useTaskTypes()
  const quickCreate = useQuickCreateTask()
  const projects: Project[] = Array.isArray(projectsData) ? projectsData : []
  const types: TaskType[] = Array.isArray(typesData) ? typesData : []

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [typeName, setTypeName] = useState('')

  const activeProject = projectId || projects[0]?.id || ''
  const activeType = types.find((t) => t.name === (typeName || types[0]?.name)) ?? types[0] ?? null
  const preview = activeType?.subtasks ?? []
  const canCreate = title.trim().length > 0 && Boolean(activeProject) && Boolean(activeType)

  function submit() {
    if (!canCreate || !activeType) return
    quickCreate.mutate({ projectId: activeProject, title: title.trim(), task_type: activeType.name, subtasks: activeType.subtasks })
    setTitle('')
  }

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
        <span style={{ width: 7, height: 18, background: 'var(--accent)', borderRadius: 3 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Crear tarea rápida</span>
      </div>

      <input aria-label="título de la tarea" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Escribe el título de la tarea…"
        style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 14px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, marginBottom: 14, outline: 'none' }} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#7a7a7a', fontWeight: 600, marginBottom: 7 }}>PROYECTO</div>
          {projects.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8a8a8a' }}>Crea un proyecto primero</div>
          ) : (
            <select aria-label="proyecto" value={activeProject} onChange={(e) => setProjectId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#7a7a7a', fontWeight: 600, marginBottom: 7 }}>TIPO DE TAREA</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {types.map((t) => {
              const on = activeType?.id === t.id
              return (
                <span key={t.id} onClick={() => setTypeName(t.name)}
                  style={{ borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${on ? t.color : 'var(--border)'}`, background: on ? `${t.color}22` : 'var(--bg-1)', color: on ? t.color : '#c0c0c0' }}>
                  {t.name}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {preview.length > 0 && (
        <div style={{ background: 'var(--bg-1)', border: '1px dashed rgba(250,197,28,.3)', borderRadius: 11, padding: 15, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Subtareas que se crearán automáticamente · {preview.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#d5d5d5' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid #3a3a3a', flex: '0 0 auto' }} />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={submit} disabled={!canCreate || quickCreate.isPending}
        style={{ width: '100%', background: canCreate ? 'var(--accent)' : 'var(--bg-5)', color: canCreate ? '#161616' : '#666', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: canCreate ? 'pointer' : 'default' }}>
        Crear tarea{preview.length > 0 ? ` y ${preview.length} subtareas` : ''}
      </button>
    </div>
  )
}
