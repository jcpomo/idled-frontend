import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTeamChat } from '@/lib/teamChat'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  sent: string[] = []
  constructor(_url: string) { FakeWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  emitMessage(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

const msg = (id: string, extra: Record<string, unknown> = {}) => ({
  id, scope: 'global', project_id: null, author_external_id: 'x', author_name: 'X',
  content: `c-${id}`, created_at: '', mine: false, ...extra,
})

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket as never)
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
})
afterEach(() => vi.restoreAllMocks())

it('seeds messages from history then appends live', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([msg('h1')] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m2')) })
  await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['h1', 'm2']))
})

it('dedups a live message already present by id', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m1')) })
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m1')) })
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
})

it('send delegates to the socket', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
  act(() => { result.current.send('hola') })
  expect(FakeWebSocket.instances[0].sent[0]).toBe(JSON.stringify({ content: 'hola' }))
})

it('loads project history when scope is project', async () => {
  const spy = vi.spyOn(api, 'listProjectMessages').mockResolvedValue([] as never)
  renderHook(() => useTeamChat('project', 'p1'))
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1'))
})

it('closes the socket on unmount', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { unmount } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
  const closeSpy = vi.spyOn(FakeWebSocket.instances[0], 'close')
  unmount()
  expect(closeSpy).toHaveBeenCalled()
})
