import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as queries from '@/lib/queries'
import * as chat from '@/lib/chat'
import * as auth from '@/lib/auth'
import { ApiError } from '@/lib/api'
import type { Conversation } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const convs: Conversation[] = [
  { id: 'c1', title: '¿facturas?', created_at: '2026-07-04T10:00:00+00:00' },
]

function stub(streamImpl?: typeof chat.streamChat) {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useConversations').mockReturnValue({ data: convs } as never)
  vi.spyOn(queries, 'useMessages').mockReturnValue({ data: [] } as never)
  const stream = vi.spyOn(chat, 'streamChat')
  if (streamImpl) stream.mockImplementation(streamImpl as never)
  else stream.mockResolvedValue(undefined)
  return { stream }
}

it('lists conversations', async () => {
  stub()
  const { default: Page } = await import('@/app/(app)/assistant/page')
  wrap(<Page />)
  expect(screen.getByText('¿facturas?')).toBeInTheDocument()
})

it('sends a message and streams the assistant tokens', async () => {
  // stream mock that emits meta + two tokens and never resolves, so `pending` stays visible
  stub(((_t, _i, h) => {
    h.onMeta?.({ conversation_id: 'c9', model: 'gpt-4o', tools_used: [] })
    h.onToken?.('Hola ')
    h.onToken?.('mundo')
    return new Promise<void>(() => {})
  }) as never)
  const { default: Page } = await import('@/app/(app)/assistant/page')
  wrap(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(screen.getByTestId('msg-user').textContent).toContain('hola')
  expect(await screen.findByTestId('msg-assistant')).toHaveTextContent('Hola mundo')
})

it('sends with the typed message and no conversationId when starting fresh', async () => {
  const { stream } = stub()
  const { default: Page } = await import('@/app/(app)/assistant/page')
  wrap(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(stream).toHaveBeenCalledWith('tok', { message: 'hola', conversationId: undefined }, expect.anything())
})

it('logs out when the stream fails with a 401', async () => {
  const onAuthErrorSpy = vi.spyOn(auth, 'onAuthError').mockImplementation(() => {})
  stub((() => Promise.reject(new ApiError('x', 401))) as never)
  const { default: Page } = await import('@/app/(app)/assistant/page')
  wrap(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  await new Promise((r) => setTimeout(r, 0))
  expect(onAuthErrorSpy).toHaveBeenCalled()
})
