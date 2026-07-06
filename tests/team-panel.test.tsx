import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Member, UserDir, Project } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const members: Member[] = [
  { external_id: 'owner', name: 'Dueño', is_owner: true },
  { external_id: 'ext-2', name: 'Bea', is_owner: false },
]
const users: UserDir[] = [
  { external_id: 'owner', name: 'Dueño' },
  { external_id: 'ext-2', name: 'Bea' },
  { external_id: 'ext-3', name: 'Carla' },
]

function stub(isOwner: boolean) {
  const addMut = vi.fn(); const removeMut = vi.fn()
  const project: Project = { id: 'p1', name: 'P', is_owner: isOwner }
  vi.spyOn(queries, 'useProjects').mockReturnValue({ data: [project] } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: members } as never)
  vi.spyOn(queries, 'useUsers').mockReturnValue({ data: users } as never)
  vi.spyOn(queries, 'useAddMember').mockReturnValue({ mutate: addMut } as never)
  vi.spyOn(queries, 'useRemoveMember').mockReturnValue({ mutate: removeMut } as never)
  return { addMut, removeMut }
}

it('lists the team with the owner marked', async () => {
  stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  expect(screen.getAllByTestId('team-member')).toHaveLength(2)
  expect(screen.getByText(/Dueño/)).toHaveTextContent('(dueño)')
})

it('owner can add a member (directory excludes existing members)', async () => {
  const { addMut } = stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  const select = screen.getByLabelText('añadir miembro') as HTMLSelectElement
  // Carla (ext-3) is addable; owner + ext-2 are already members and excluded
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'ext-3'])
  fireEvent.change(select, { target: { value: 'ext-3' } })
  fireEvent.click(screen.getByLabelText('confirmar añadir'))
  expect(addMut).toHaveBeenCalledWith('ext-3')
})

it('owner can remove a non-owner member', async () => {
  const { removeMut } = stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  fireEvent.click(screen.getByLabelText('quitar ext-2'))
  expect(removeMut).toHaveBeenCalledWith('ext-2')
})

it('a non-owner sees the team but no management controls', async () => {
  stub(false)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  expect(screen.getAllByTestId('team-member')).toHaveLength(2)
  expect(screen.queryByLabelText('añadir miembro')).toBeNull()
  expect(screen.queryByLabelText('quitar ext-2')).toBeNull()
})
