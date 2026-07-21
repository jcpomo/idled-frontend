'use client'
import Link from 'next/link'
import type { Project } from '@/lib/types'

export default function ProjectCard({ project }: { project: Project }) {
  const total = project.task_count ?? 0
  const done = project.done_count ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const color = project.color ?? '#A9A9A9'
  return (
    <Link href={`/project/${project.id}`} className="card-hover"
      style={{ display: 'block', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flex: '0 0 auto' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
        {project.is_owner === false && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8a8a8a' }}>compartido</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span className="mono" style={{ fontSize: 11, color: '#8a8a8a' }}>{total} tareas</span>
        <span className="mono" style={{ fontSize: 11, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: '#222', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color }} />
      </div>
    </Link>
  )
}
