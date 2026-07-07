import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as tc from '@/lib/teamChat'
import type { ChatMessage } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const one: ChatMessage = {
  id: 'm1', scope: 'global', project_id: null, author_external_id: 'x',
  author_name: 'X', content: 'hola', created_at: '', mine: false,
}

function stub(messages: ChatMessage[], status: tc.ChatStatus = 'open') {
  const send = vi.fn()
  vi.spyOn(tc, 'useTeamChat').mockReturnValue({ messages, status, send } as never)
  return { send }
}

it('renders messages and sends on click', async () => {
  const { send } = stub([one])
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByTestId('chat-message')).toHaveTextContent('hola')
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'buenas' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(send).toHaveBeenCalledWith('buenas')
})

it('disables the composer when not open', async () => {
  stub([], 'connecting')
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByLabelText('enviar')).toBeDisabled()
  expect(screen.getByLabelText('mensaje')).toBeDisabled()
})

it('shows an empty state', async () => {
  stub([], 'open')
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByText('Sin mensajes todavía')).toBeInTheDocument()
})
