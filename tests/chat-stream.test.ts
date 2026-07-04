import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamChat } from '@/lib/chat'

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

it('parses meta/token/done and handles a frame split across chunks', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
    'data: {"type":"meta","conversation_id":"c1","model":"gpt-4o","tools_used":[]}\n\n',
    'data: {"type":"token","text":"Hola "}\n\ndata: {"type":"to',
    'ken","text":"mundo"}\n\n',
    'data: {"type":"done"}\n\n',
  ]))
  const metas: any[] = []
  const tokens: string[] = []
  let dones = 0
  await streamChat('tok', { message: 'hi' }, {
    onMeta: (m) => metas.push(m),
    onToken: (t) => tokens.push(t),
    onDone: () => { dones += 1 },
  })
  expect(metas[0].conversation_id).toBe('c1')
  expect(tokens).toEqual(['Hola ', 'mundo'])
  expect(dones).toBe(1)
})

it('throws on a non-ok response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
  await expect(streamChat('tok', { message: 'hi' }, {})).rejects.toThrow()
})
