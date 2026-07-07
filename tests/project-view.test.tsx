import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/kanban/Board', () => ({ default: () => <div data-testid="board-view" /> }))
vi.mock('@/components/kanban/TaskListView', () => ({ default: () => <div data-testid="list-view" /> }))

beforeEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })

it('defaults to the board view', async () => {
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  expect(screen.getByTestId('board-view')).toBeInTheDocument()
  expect(screen.queryByTestId('list-view')).not.toBeInTheDocument()
})

it('switches to the list view and persists the choice', async () => {
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  fireEvent.click(screen.getByTestId('view-toggle-list'))
  expect(screen.getByTestId('list-view')).toBeInTheDocument()
  expect(screen.queryByTestId('board-view')).not.toBeInTheDocument()
  expect(window.localStorage.getItem('idled_project_view')).toBe('list')
})

it('starts in the list view when localStorage says so', async () => {
  window.localStorage.setItem('idled_project_view', 'list')
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  expect(screen.getByTestId('list-view')).toBeInTheDocument()
})
