import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openChatSocket } from '@/lib/teamChat'
import * as auth from '@/lib/auth'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  url: string
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  emitOpen() { this.readyState = 1; this.onopen?.() }
  emitMessage(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  emitClose(code: number) { this.onclose?.({ code }) }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket as never)
  vi.spyOn(auth, 'getToken').mockReturnValue('tok123')
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('connects to the correct URL with token', () => {
  openChatSocket('global', null, { onMessage: vi.fn() })
  expect(FakeWebSocket.instances[0].url).toContain('/api/team-chat/global/ws?token=tok123')
})

it('builds the project URL', () => {
  openChatSocket('project', 'p1', { onMessage: vi.fn() })
  expect(FakeWebSocket.instances[0].url).toContain('/api/team-chat/projects/p1/ws?token=tok123')
})

it('parses incoming messages', () => {
  const onMessage = vi.fn()
  openChatSocket('global', null, { onMessage })
  FakeWebSocket.instances[0].emitMessage({ id: 'm1', content: 'hi' })
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', content: 'hi' }))
})

it('sends JSON-wrapped content when open', () => {
  const sock = openChatSocket('global', null, { onMessage: vi.fn() })
  FakeWebSocket.instances[0].emitOpen()
  sock.send('hola')
  expect(FakeWebSocket.instances[0].sent[0]).toBe(JSON.stringify({ content: 'hola' }))
})

it('reconnects after a network close', () => {
  openChatSocket('global', null, { onMessage: vi.fn() })
  FakeWebSocket.instances[0].emitClose(1006)
  vi.advanceTimersByTime(1000)
  expect(FakeWebSocket.instances.length).toBe(2)
})

it('does NOT reconnect on auth close (4401) and reports unauthorized', () => {
  const onStatus = vi.fn()
  openChatSocket('global', null, { onMessage: vi.fn(), onStatus })
  FakeWebSocket.instances[0].emitClose(4401)
  vi.advanceTimersByTime(10000)
  expect(FakeWebSocket.instances.length).toBe(1)
  expect(onStatus).toHaveBeenCalledWith('unauthorized')
})

it('does not reconnect after we close it', () => {
  const sock = openChatSocket('global', null, { onMessage: vi.fn() })
  sock.close()
  FakeWebSocket.instances[0].emitClose(1006)
  vi.advanceTimersByTime(5000)
  expect(FakeWebSocket.instances.length).toBe(1)
})
