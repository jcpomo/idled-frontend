'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConversations, useMessages } from '@/lib/queries'
import { streamChat } from '@/lib/chat'
import { getToken } from '@/lib/auth'

function Bubble({ role, text }: { role: string; text: string }) {
  const mine = role === 'user'
  return (
    <div data-testid={`msg-${role}`}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: '8px 12px',
        marginBottom: 8, borderRadius: 10, whiteSpace: 'pre-wrap',
        background: mine ? 'var(--accent)' : 'var(--bg-3)', color: mine ? '#000' : 'var(--text)',
      }}>
      {text}
    </div>
  )
}

export default function AssistantPage() {
  const qc = useQueryClient()
  const { data: conversations } = useConversations()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: messages } = useMessages(selectedId ?? '')
  const [pending, setPending] = useState<{ user: string; assistant: string } | null>(null)
  const [input, setInput] = useState('')

  async function send() {
    const message = input.trim()
    if (!message || pending) return
    setInput('')
    setPending({ user: message, assistant: '' })
    let convId = selectedId
    try {
      await streamChat(getToken() ?? '', { message, conversationId: selectedId ?? undefined }, {
        onMeta: (m) => { convId = m.conversation_id },
        onToken: (t) => setPending((p) => (p ? { ...p, assistant: p.assistant + t } : p)),
      })
    } catch {
      setPending((p) => (p ? { ...p, assistant: '⚠️ Error al responder' } : p))
      return
    }
    if (convId) {
      setSelectedId(convId)
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', convId] })
    }
    setPending(null)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 260, flex: '0 0 260px', borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto' }}>
        <button aria-label="nueva conversación" onClick={() => { setSelectedId(null); setPending(null) }}
          style={{ width: '100%', padding: 8, marginBottom: 10, background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          + Nueva
        </button>
        {(conversations ?? []).map((c) => (
          <button key={c.id} data-testid="conversation-item"
            onClick={() => { setSelectedId(c.id); setPending(null) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: 8, marginBottom: 4,
              background: c.id === selectedId ? 'var(--bg-3)' : 'none', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13,
            }}>
            {c.title ?? '(sin título)'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {(messages ?? []).map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
          {pending && (
            <>
              <Bubble role="user" text={pending.user} />
              <Bubble role="assistant" text={pending.assistant} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input aria-label="mensaje" value={input} disabled={!!pending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder="Pregunta al asistente…"
            style={{ flex: 1, padding: 10, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
          <button aria-label="enviar" onClick={send} disabled={!!pending}
            style={{ padding: '10px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
