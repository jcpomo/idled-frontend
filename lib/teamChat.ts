import { useEffect, useRef, useState } from 'react'
import { apiBase } from './api'
import * as api from './api'
import { getToken } from './auth'
import type { ChatMessage } from './types'

export type ChatStatus = 'connecting' | 'open' | 'closed' | 'unauthorized'

export function wsBase(): string {
  return apiBase().replace(/^http/, 'ws')
}

interface Handlers {
  onMessage: (msg: ChatMessage) => void
  onStatus?: (status: ChatStatus) => void
}

const MAX_RETRIES = 5

export function openChatSocket(
  scope: 'global' | 'project', projectId: string | null, handlers: Handlers,
): { send: (content: string) => void; close: () => void } {
  const path = scope === 'global'
    ? '/api/team-chat/global/ws'
    : `/api/team-chat/projects/${projectId}/ws`
  let ws: WebSocket | null = null
  let closedByUs = false
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    handlers.onStatus?.('connecting')
    const token = getToken() ?? ''
    ws = new WebSocket(`${wsBase()}${path}?token=${encodeURIComponent(token)}`)
    ws.onopen = () => { retries = 0; handlers.onStatus?.('open') }
    ws.onmessage = (e) => {
      try { handlers.onMessage(JSON.parse(e.data)) } catch { /* ignora frames malformados */ }
    }
    ws.onclose = (e) => {
      if (closedByUs) return
      if (e.code === 4401 || e.code === 4403) { handlers.onStatus?.('unauthorized'); return }
      handlers.onStatus?.('closed')
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 10000)
        retries += 1
        retryTimer = setTimeout(connect, delay)
      }
    }
  }
  connect()

  return {
    send: (content: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ content }))
      }
    },
    close: () => {
      closedByUs = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    },
  }
}

export function useTeamChat(scope: 'global' | 'project', projectId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('connecting')
  const sockRef = useRef<{ send: (c: string) => void; close: () => void } | null>(null)

  useEffect(() => {
    let active = true
    const token = getToken() ?? ''
    const load = scope === 'global'
      ? api.listGlobalMessages(token)
      : api.listProjectMessages(token, projectId as string)
    load.then((history) => { if (active) setMessages(history) }).catch(() => { /* onAuthError global cubre 401 */ })

    const sock = openChatSocket(scope, projectId ?? null, {
      onMessage: (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      },
      onStatus: setStatus,
    })
    sockRef.current = sock
    return () => { active = false; sock.close() }
  }, [scope, projectId])

  return {
    messages,
    status,
    send: (content: string) => sockRef.current?.send(content),
  }
}
