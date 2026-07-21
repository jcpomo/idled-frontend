'use client'
import { useState } from 'react'
import { useTaskTypes, useCreateTaskType, useUpdateTaskType, useDeleteTaskType } from '@/lib/queries'
import { canManageTypes } from '@/lib/roles'
import { getToken, decodeToken } from '@/lib/auth'
import type { TaskType } from '@/lib/types'

const PALETTE = ['#FAC51C', '#FF7F24', '#46C26A', '#4FB6E8', '#E5484D', '#C9A227', '#A9A9A9']

export default function TaskTypesManager() {
  const { data, isError } = useTaskTypes()
  const createType = useCreateTaskType()
  const updateType = useUpdateTaskType()
  const deleteType = useDeleteTaskType()
  const role = decodeToken(getToken())?.role ?? null
  const canManage = canManageTypes(role)
  const types: TaskType[] = Array.isArray(data) ? data : []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = types.find((t) => t.id === selectedId) ?? null

  function patchSubs(t: TaskType, subs: string[]) {
    updateType.mutate({ id: t.id, patch: { subtasks: subs } })
  }

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <span style={{ width: 7, height: 18, background: 'var(--accent)', borderRadius: 3 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Tipos de tarea y plantillas de subtareas</span>
      </div>
      <div style={{ fontSize: 12, color: '#7a7a7a', marginBottom: 16, paddingLeft: 16 }}>
        Las subtareas de la plantilla se crean automáticamente al usar el tipo.
      </div>
      {isError && <div style={{ color: 'var(--red)', fontSize: 13 }}>No se pudieron cargar los tipos</div>}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* lista de tipos */}
        <div style={{ flex: '0 0 236px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {types.map((t) => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="row-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selected?.id === t.id ? 'rgba(250,197,28,.4)' : 'var(--border)'}`, background: selected?.id === t.id ? 'var(--bg-4)' : 'transparent' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, flex: '0 0 auto' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: selected?.id === t.id ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <span className="mono" style={{ fontSize: 10.5, color: '#777', background: 'var(--bg-5)', borderRadius: 6, padding: '2px 7px' }}>{t.subtasks.length}</span>
            </div>
          ))}
          {canManage && (
            <button onClick={() => createType.mutate({ name: 'Nuevo tipo', color: PALETTE[types.length % PALETTE.length], subtasks: [] })}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', border: '1px dashed rgba(250,197,28,.35)', borderRadius: 10, color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}>
              + Nuevo tipo de tarea
            </button>
          )}
        </div>

        {/* editor / lectura */}
        {selected && (
          <div style={{ flex: 1, minWidth: 320, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 13, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15 }}>
              <span style={{ width: 13, height: 13, borderRadius: 4, background: selected.color, flex: '0 0 auto' }} />
              {canManage ? (
                <input aria-label="nombre del tipo" defaultValue={selected.name} key={selected.id + selected.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== selected.name) updateType.mutate({ id: selected.id, patch: { name: v } }) }}
                  style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
              ) : (
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selected.name}</span>
              )}
              {canManage && (
                <button aria-label="eliminar tipo" onClick={() => { deleteType.mutate(selected.id); setSelectedId(null) }}
                  style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(229,72,77,.1)', border: '1px solid rgba(229,72,77,.25)', color: 'var(--red)', cursor: 'pointer', fontSize: 15 }}>×</button>
              )}
            </div>

            {canManage && (
              <>
                <div style={{ fontSize: 10.5, color: '#7a7a7a', fontWeight: 700, letterSpacing: '.05em', marginBottom: 9 }}>COLOR DEL TIPO</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                  {PALETTE.map((c) => (
                    <span key={c} onClick={() => updateType.mutate({ id: selected.id, patch: { color: c } })}
                      role="button" aria-label={`color ${c}`}
                      style={{ width: 26, height: 26, borderRadius: 8, cursor: 'pointer', background: c, boxShadow: selected.color === c ? '0 0 0 2px var(--bg-1), 0 0 0 4px #fff' : 'none' }} />
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 11 }}>
              SUBTAREAS DE LA PLANTILLA · {selected.subtasks.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.subtasks.map((s, i) => (
                <div key={i} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 9, background: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid #3a3a3a', flex: '0 0 auto' }} />
                  {canManage ? (
                    <input aria-label={`subtarea ${i + 1}`} defaultValue={s} key={selected.id + '-' + i + '-' + s}
                      onBlur={(e) => { const v = e.target.value; if (v !== s) { const next = [...selected.subtasks]; next[i] = v; patchSubs(selected, next) } }}
                      style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none', padding: '5px 2px' }} />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13, color: '#d0d0d0' }}>{s}</span>
                  )}
                  {canManage && (
                    <>
                      <button aria-label={`subir ${i + 1}`} disabled={i === 0} onClick={() => { const next = [...selected.subtasks]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; patchSubs(selected, next) }}
                        style={{ background: 'none', border: 'none', color: '#7a7a7a', cursor: 'pointer', fontSize: 11, width: 20 }}>▲</button>
                      <button aria-label={`bajar ${i + 1}`} disabled={i === selected.subtasks.length - 1} onClick={() => { const next = [...selected.subtasks]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; patchSubs(selected, next) }}
                        style={{ background: 'none', border: 'none', color: '#7a7a7a', cursor: 'pointer', fontSize: 11, width: 20 }}>▼</button>
                      <button aria-label={`borrar ${i + 1}`} onClick={() => patchSubs(selected, selected.subtasks.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 15, width: 20 }}>×</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {canManage && (
              <button onClick={() => patchSubs(selected, [...selected.subtasks, 'Nueva subtarea'])}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 9, border: '1px dashed rgba(255,255,255,.12)', borderRadius: 9, color: '#888', fontSize: 12.5, cursor: 'pointer', marginTop: 6, background: 'none', fontFamily: 'inherit', width: '100%' }}>
                + Añadir subtarea a la plantilla
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
