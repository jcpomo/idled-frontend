'use client'
import Link from 'next/link'
import { logout } from '@/lib/auth'
import { useNotifications } from '@/lib/queries'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Asistente IA' },
  { href: '/documentos', label: 'Documentos' },
  { href: '/chat', label: 'Chat de equipo' },
]

const PLACEHOLDERS = ['Equipo']

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '9px 10px',
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 600,
  color: 'var(--text)',
  textDecoration: 'none',
} as const

export default function Sidebar() {
  const { data: notifs } = useNotifications()
  const unread = (notifs ?? []).filter((n) => !n.read).length
  return (
    <aside
      style={{
        width: 250,
        flex: '0 0 250px',
        background: 'var(--bg-2)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div
          style={{
            width: 28,
            height: 28,
            background: 'var(--accent)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 11,
            color: 'var(--bg-4)',
            flexShrink: 0,
          }}
        >
          I+D
        </div>
        <span style={{ fontWeight: 700, letterSpacing: '.06em', fontSize: 15, color: 'var(--text)' }}>
          IMASD
        </span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="side-hover" style={itemStyle}>
            {n.label}
          </Link>
        ))}
        <Link href="/notifications" className="side-hover" style={itemStyle}>
          Notificaciones
          {unread > 0 && (
            <span data-testid="unread-badge"
              style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
              {unread}
            </span>
          )}
        </Link>
        {PLACEHOLDERS.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            style={{ ...itemStyle, opacity: 0.45, cursor: 'default' }}
          >
            {label} · próximamente
          </span>
        ))}
      </nav>
      <button aria-label="cerrar sesión" onClick={() => logout()}
        style={{ ...itemStyle, marginTop: 'auto', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', opacity: 0.8 }}>
        Cerrar sesión
      </button>
    </aside>
  )
}
