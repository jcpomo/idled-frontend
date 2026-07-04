import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProjects, createTask, moveTask, ApiError } from '@/lib/api'

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://backend'
  vi.restoreAllMocks()
})

it('listProjects GETs with bearer token', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, json: async () => [{ id: 'p1', name: 'Serie X' }],
  })
  vi.stubGlobal('fetch', fetchMock)
  const out = await listProjects('tok')
  expect(out[0].name).toBe('Serie X')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://backend/api/projects')
  expect(init.headers.Authorization).toBe('Bearer tok')
})

it('moveTask POSTs status+position', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ id: 't1', status: 'done', position: 0 }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await moveTask('tok', 't1', 'done', 0)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://backend/api/tasks/t1/move')
  expect(JSON.parse(init.body)).toEqual({ status: 'done', position: 0 })
})

it('apiFetch throws on non-ok', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
  await expect(createTask('tok', 'p1', { title: 'x' })).rejects.toThrow()
})

it('apiFetch throws an ApiError carrying the status', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }))
  const err = await createTask('tok', 'p1', { title: 'x' }).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toBeInstanceOf(Error)
  expect((err as ApiError).status).toBe(503)
})
