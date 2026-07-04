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
  vi.spyOn(queries, 'useDocuments').mockReturnValue({ data: list } as never)
  vi.spyOn(queries, 'useUploadDocument').mockReturnValue({ mutate, isPending: false } as never)
  return { mutate }
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
