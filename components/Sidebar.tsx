'use client'
import { useState } from 'react'
import Link from 'next/link'
import { logout, getToken, decodeToken } from '@/lib/auth'
import { useNotifications, useProjects } from '@/lib/queries'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Asistente IA' },
  { href: '/documentos', label: 'Documentos' },
  { href: '/chat', label: 'Chat de equipo' },
]

const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9,
  fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
} as const

function initials(name: string | null, sub: string): string {
  const base = (name ?? sub ?? '').trim()
  if (!base) return '?'
  const parts = base.split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)).toUpperCase()
}

export default function Sidebar() {
  const { data: notifs } = useNotifications()
  const { data: projects } = useProjects()
  const [projectsOpen, setProjectsOpen] = useState(true)
  const unread = (notifs ?? []).filter((n) => !n.read).length
  const user = decodeToken(getToken())
  const list = projects ?? []

  return (
    <aside style={{ width: 250, flex: '0 0 250px', background: '#565656',
      borderRight: '1px solid rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', padding: '18px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: 'var(--bg-4)', flexShrink: 0 }}>I+D</div>
        <span style={{ fontWeight: 700, letterSpacing: '.06em', fontSize: 15, color: 'var(--text)' }}>IMASD</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="side-hover" style={itemStyle}>{n.label}</Link>
        ))}
        <Link href="/notifications" className="side-hover" style={itemStyle}>
          Notificaciones
          {unread > 0 && (
            <span data-testid="unread-badge" style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000',
              borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>{unread}</span>
          )}
        </Link>
        <span aria-disabled="true" style={{ ...itemStyle, opacity: 0.45, cursor: 'default' }}>Equipo · próximamente</span>
      </nav>

      <div onClick={() => setProjectsOpen((v) => !v)} className="side-hover"
        style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, cursor: 'pointer',
          fontSize: 10.5, letterSpacing: '.13em', color: 'rgba(255,255,255,.75)', fontWeight: 700,
          padding: '14px 10px 8px', marginTop: 6 }}>
        <span>PROYECTOS</span>
        <span className="mono" style={{ color: 'rgba(255,255,255,.55)', fontSize: 10 }}>{list.length}</span>
        <span style={{ marginLeft: 'auto', transform: `rotate(${projectsOpen ? 0 : -90}deg)`, transition: 'transform .18s' }}>⌄</span>
      </div>
      {projectsOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {list.map((p) => (
            <Link key={p.id} href={`/project/${p.id}`} className="side-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                textDecoration: 'none', fontSize: 13, color: '#ededed' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, flex: '0 0 auto', background: p.color ?? '#A9A9A9' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
              <span className="mono" style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{p.task_count ?? 0}</span>
            </Link>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10,
        borderTop: '1px solid rgba(0,0,0,.25)', marginTop: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
          {initials(user?.name ?? null, user?.sub ?? '')}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ?? 'Usuario'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{user?.role ?? 'IMASD'}</div>
        </div>
        <button aria-label="cerrar sesión" onClick={() => logout()}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: 16 }}>⏻</button>
      </div>
    </aside>
  )
}
