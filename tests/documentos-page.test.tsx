import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { DocumentItem } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const docs: DocumentItem[] = [
  { id: 'd1', filename: 'informe.pdf', status: 'indexed', created_at: '2026-07-04T10:00:00+00:00', error: null },
  { id: 'd2', filename: 'roto.xlsx', status: 'failed', created_at: '2026-07-04T11:00:00+00:00', error: 'no se pudo leer' },
]

function stub(list: DocumentItem[]) {
  const mutate = vi.fn()
  const del = vi.fn()
  vi.spyOn(queries, 'useDocuments').mockReturnValue({ data: list } as never)
  vi.spyOn(queries, 'useUploadDocument').mockReturnValue({ mutate, isPending: false } as never)
  vi.spyOn(queries, 'useDeleteDocument').mockReturnValue({ mutate: del, isPending: false } as never)
  return { mutate, del }
}

it('lists documents with status and shows the error on a failed one', async () => {
  stub(docs)
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  expect(screen.getByText('informe.pdf')).toBeInTheDocument()
  expect(screen.getByText('indexed')).toBeInTheDocument()
  expect(screen.getByText('no se pudo leer')).toBeInTheDocument()
  expect(screen.getAllByTestId('document-item')).toHaveLength(2)
})

it('shows an empty state with no documents', async () => {
  stub([])
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  expect(screen.getByText('Sin documentos')).toBeInTheDocument()
})

it('uploads the chosen file', async () => {
  const { mutate } = stub([])
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  const file = new File(['x'], 'nuevo.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('archivo'), { target: { files: [file] } })
  fireEvent.click(screen.getByLabelText('subir'))
  expect(mutate).toHaveBeenCalledWith(file, expect.anything())
})

it('deletes a document after a two-step confirm', async () => {
  const { del } = stub(docs)
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  fireEvent.click(screen.getAllByLabelText('eliminar documento')[0])
  expect(del).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('confirmar borrado'))
  expect(del).toHaveBeenCalledWith('d1', expect.anything())
})

it('cancels a delete without calling the mutation', async () => {
  const { del } = stub(docs)
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  fireEvent.click(screen.getAllByLabelText('eliminar documento')[0])
  fireEvent.click(screen.getByLabelText('cancelar borrado'))
  expect(del).not.toHaveBeenCalled()
  expect(screen.getAllByLabelText('eliminar documento')).toHaveLength(2)
})
