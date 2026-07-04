import { apiBase } from '@/lib/api'

export async function uploadDocument(
  token: string,
  file: File,
): Promise<{ document_id: string; status: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${apiBase()}/api/documentos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Upload ${res.status}`)
  return (await res.json()) as { document_id: string; status: string }
}
