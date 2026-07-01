'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useProjects, useCreateProject } from '@/lib/queries'

export default function Dashboard() {
  const { data: projects, isLoading } = useProjects()
  const create = useCreateProject()
  const [name, setName] = useState('')

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Proyectos</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          aria-label="nuevo proyecto" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del proyecto"
          style={{ padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
        />
        <button
          onClick={() => { if (name.trim()) { create.mutate(name.trim()); setName('') } }}
          disabled={create.isPending}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600 }}>
          Nuevo proyecto
        </button>
      </div>
      {isLoading ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {(projects ?? []).map((p) => (
            <Link key={p.id} href={`/project/${p.id}`}
              style={{ display: 'block', padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', textDecoration: 'none' }}>
              {p.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
