'use client'
import { useState } from 'react'
import { useProjects, useCreateProject, useMyTasks } from '@/lib/queries'
import { getToken, decodeToken } from '@/lib/auth'
import { greeting, taskStats } from '@/lib/dashboard'
import { todayISO } from '@/lib/dates'
import MyTasksCard from '@/components/dashboard/MyTasksCard'
import ProjectCard from '@/components/dashboard/ProjectCard'
import type { MyTask } from '@/lib/types'

export default function Dashboard() {
  const { data: projects, isLoading } = useProjects()
  const { data: myTasks } = useMyTasks()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const user = decodeToken(getToken())
  const firstName = (user?.name ?? '').split(/\s+/)[0] || 'de nuevo'
  const today = todayISO()
  const mine: MyTask[] = Array.isArray(myTasks) ? myTasks : []
  const stats = taskStats(mine, today)

  return (
    <div style={{ padding: '28px 30px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 3, color: 'var(--text)' }}>
        {greeting(new Date().getHours())}, {firstName}
      </div>
      <div style={{ color: '#7a7a7a', fontSize: 14, marginBottom: 22 }}>
        Tienes <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.today} tarea{stats.today === 1 ? '' : 's'}</span> para hoy
        {' '}y <span style={{ color: 'var(--red)', fontWeight: 600 }}>{stats.overdue} atrasada{stats.overdue === 1 ? '' : 's'}</span>.
      </div>

      <div style={{ marginBottom: 22 }}>
        <MyTasksCard />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Proyectos</span>
        <button onClick={() => setAdding((v) => !v)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
          + Nuevo proyecto
        </button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input aria-label="nuevo proyecto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto"
            style={{ padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
          <button onClick={() => { if (name.trim()) { create.mutate(name.trim()); setName(''); setAdding(false) } }} disabled={create.isPending}
            style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Crear
          </button>
        </div>
      )}
      {isLoading ? (
        <p style={{ color: 'var(--text)' }}>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {(projects ?? []).map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
