'use client'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/queries'

export default function NotificationsPage() {
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const list = notifications ?? []

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontWeight: 700 }}>Notificaciones</h1>
        <button aria-label="marcar todas" onClick={() => markAll.mutate()}
          style={{ padding: '8px 12px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Marcar todas como leídas
        </button>
      </div>
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>Sin notificaciones</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((n) => (
            <button key={n.id} data-testid="notification-item" onClick={() => markRead.mutate(n.id)}
              style={{
                textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', color: 'var(--text)',
                background: n.read ? 'var(--bg-2)' : 'var(--bg-3)',
                border: `1px solid ${n.read ? 'var(--border)' : 'var(--accent)'}`,
              }}>
              <div>{n.message}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{n.created_at}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
