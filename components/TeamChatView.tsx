'use client'
import { useState } from 'react'
import { useTeamChat } from '@/lib/teamChat'

export default function TeamChatView({ scope, projectId }: { scope: 'global' | 'project'; projectId?: string }) {
  const { messages, status, send } = useTeamChat(scope, projectId)
  const [draft, setDraft] = useState('')

  function submit() {
    const c = draft.trim()
    if (!c) return
    send(c)
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p style={{ color: '#888' }}>Sin mensajes todavía</p>
        ) : messages.map((m) => (
          <div key={m.id} data-testid="chat-message"
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: 10, borderRadius: 10,
              background: m.mine ? 'var(--accent)' : 'var(--bg-3)', color: m.mine ? '#000' : 'var(--text)',
            }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{m.author_name}</div>
            <div>{m.content}</div>
          </div>
        ))}
      </div>
      {status === 'unauthorized' && (
        <p role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>No se pudo conectar al chat.</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input aria-label="mensaje" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          disabled={status !== 'open'} placeholder="Escribe un mensaje…"
          style={{ flex: 1, padding: 10, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
        <button aria-label="enviar" onClick={submit} disabled={status !== 'open'}
          style={{ padding: '10px 16px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          Enviar
        </button>
      </div>
    </div>
  )
}
