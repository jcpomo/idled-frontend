import { it, expect, vi, beforeEach } from 'vitest'
import { uploadDocument } from '@/lib/documents'

beforeEach(() => vi.restoreAllMocks())

it('POSTs the file as multipart with the bearer token and no JSON content-type', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ document_id: 'd1', status: 'uploaded' }), { status: 200 }),
  )
  const file = new File(['hola'], 'a.pdf', { type: 'application/pdf' })
  const out = await uploadDocument('tok', file)
  expect(out).toEqual({ document_id: 'd1', status: 'uploaded' })
  const [url, init] = spy.mock.calls[0]
  expect(String(url)).toContain('/api/documentos')
  expect(init?.method).toBe('POST')
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  expect(init?.body).toBeInstanceOf(FormData)
  expect((init?.body as FormData).get('file')).toBe(file)
})

it('throws an ApiError with the status on a non-ok response', async () => {
  const { ApiError } = await import('@/lib/api')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }))
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  const err = await uploadDocument('tok', file).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.status).toBe(403)
})
