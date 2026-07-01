'use client'
import Link from 'next/link'

const NAV = [{ href: '/dashboard', label: 'Dashboard' }]

const PLACEHOLDERS = ['Chat de equipo', 'Notificaciones', 'Equipo']

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
    </aside>
  )
}
