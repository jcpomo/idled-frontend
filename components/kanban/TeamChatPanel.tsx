'use client'
import { useState } from 'react'
import TeamChatView from '@/components/TeamChatView'

export default function TeamChatPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button aria-label="abrir chat" onClick={() => setOpen(true)}
        style={{ padding: '6px 12px', background: 'var(--bg-4)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
        💬 Chat
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
          <aside data-testid="team-chat-panel"
            style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
              background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
              padding: 16, display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700 }}>Chat del proyecto</span>
              <button aria-label="cerrar chat" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TeamChatView scope="project" projectId={projectId} />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
