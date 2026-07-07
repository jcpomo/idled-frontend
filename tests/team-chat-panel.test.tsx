import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as tc from '@/lib/teamChat'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(tc, 'useTeamChat').mockReturnValue({ messages: [], status: 'open', send: vi.fn() } as never)
})

it('opens and closes the drawer', async () => {
  const { default: Panel } = await import('@/components/kanban/TeamChatPanel')
  render(<Panel projectId="p1" />)
  expect(screen.queryByTestId('team-chat-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('abrir chat'))
  expect(screen.getByTestId('team-chat-panel')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('cerrar chat'))
  expect(screen.queryByTestId('team-chat-panel')).not.toBeInTheDocument()
})
