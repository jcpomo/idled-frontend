'use client'
import { useState } from 'react'
import { useProjects, useMembers, useUsers, useAddMember, useRemoveMember } from '@/lib/queries'

const chip = {
  fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px',
} as const

export default function TeamPanel({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects()
  const { data: members } = useMembers(projectId)
  const { data: users } = useUsers()
  const add = useAddMember(projectId)
  const remove = useRemoveMember(projectId)
  const [pick, setPick] = useState('')

  const isOwner = (projects ?? []).find((p) => p.id === projectId)?.is_owner === true
  const memberIds = new Set((members ?? []).map((m) => m.external_id))
  const addable = (users ?? []).filter((u) => !memberIds.has(u.external_id))

  return (
    <div style={{ padding: 12, borderBottom: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#888' }}>Equipo:</span>
      {(members ?? []).map((m) => (
        <span key={m.external_id} data-testid="team-member" style={chip}>
          {(m.name ?? m.external_id) + (m.is_owner ? ' (dueño)' : '')}
          {isOwner && !m.is_owner && (
            <button aria-label={`quitar ${m.external_id}`} onClick={() => remove.mutate(m.external_id)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0 }}>×</button>
          )}
        </span>
      ))}
      {isOwner && (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <select aria-label="añadir miembro" value={pick} onChange={(e) => setPick(e.target.value)}
            style={{ fontSize: 12, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: 4 }}>
            <option value="">+ miembro…</option>
            {addable.map((u) => <option key={u.external_id} value={u.external_id}>{u.name ?? u.external_id}</option>)}
          </select>
          <button aria-label="confirmar añadir" onClick={() => { if (pick) { add.mutate(pick); setPick('') } }}
            style={{ fontSize: 12, background: 'var(--bg-5)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '4px 8px' }}>Añadir</button>
        </span>
      )}
    </div>
  )
}
