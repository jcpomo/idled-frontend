import { apiBase } from './api'
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
