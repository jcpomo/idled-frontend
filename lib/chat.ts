import { apiBase } from '@/lib/api'

export interface ChatMeta {
  conversation_id: string
  model: string
  tools_used: string[]
}

export async function streamChat(
  token: string,
  input: { message: string; conversationId?: string },
  handlers: { onMeta?: (m: ChatMeta) => void; onToken?: (text: string) => void; onDone?: () => void },
): Promise<void> {
  const res = await fetch(`${apiBase()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: input.message, conversation_id: input.conversationId ?? null }),
  })
  if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = JSON.parse(line.slice(5).trim())
      if (payload.type === 'meta') handlers.onMeta?.(payload)
      else if (payload.type === 'token') handlers.onToken?.(payload.text)
      else if (payload.type === 'done') handlers.onDone?.()
    }
  }
}
