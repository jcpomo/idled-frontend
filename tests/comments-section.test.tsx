import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { TaskComment } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const mine: TaskComment = {
  id: 'c1', task_id: 't1', author_external_id: 'me', author_name: 'Yo',
  content: 'mío', created_at: '2026-07-04T10:00:00+00:00', edited_at: null, mine: true,
}
const other: TaskComment = {
  id: 'c2', task_id: 't1', author_external_id: 'x', author_name: 'Otro',
  content: 'ajeno', created_at: '2026-07-04T11:00:00+00:00', edited_at: null, mine: false,
}

function stub(comments: TaskComment[]) {
  const create = vi.fn(); const update = vi.fn(); const del = vi.fn()
  vi.spyOn(queries, 'useComments').mockReturnValue({ data: comments } as never)
  vi.spyOn(queries, 'useCreateComment').mockReturnValue({ mutate: create } as never)
  vi.spyOn(queries, 'useUpdateComment').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useDeleteComment').mockReturnValue({ mutate: del } as never)
  return { create, update, del }
}

it('lists comments and shows edit/delete only on mine', async () => {
  stub([mine, other])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  expect(screen.getByText('mío')).toBeInTheDocument()
  expect(screen.getByText('ajeno')).toBeInTheDocument()
  // exactly one edit + one delete control (only for the mine comment)
  expect(screen.getAllByLabelText('editar comentario')).toHaveLength(1)
  expect(screen.getAllByLabelText('borrar comentario')).toHaveLength(1)
})

it('creates a comment', async () => {
  const { create } = stub([])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.change(screen.getByLabelText('nuevo comentario'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar comentario'))
  expect(create).toHaveBeenCalledWith('hola')
})

it('edits a comment inline', async () => {
  const { update } = stub([mine])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.click(screen.getByLabelText('editar comentario'))
  const box = screen.getByLabelText('editar contenido')
  fireEvent.change(box, { target: { value: 'corregido' } })
  fireEvent.click(screen.getByLabelText('guardar comentario'))
  expect(update).toHaveBeenCalledWith({ commentId: 'c1', content: 'corregido' })
})

it('deletes a comment after confirm', async () => {
  const { del } = stub([mine])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.click(screen.getByLabelText('borrar comentario'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado' }))
  expect(del).toHaveBeenCalledWith('c1')
})
