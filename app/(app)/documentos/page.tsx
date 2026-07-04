'use client'
import { useRef, useState } from 'react'
import { useDocuments, useUploadDocument } from '@/lib/queries'

const badgeColor: Record<string, string> = {
  uploaded: '#888',
  processing: '#888',
  indexed: 'var(--green)',
  failed: 'var(--red)',
}

export default function DocumentosPage() {
  const { data: documents } = useDocuments()
  const upload = useUploadDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function onUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setError(null)
    upload.mutate(file, {
      onError: () => setError('No se pudo subir el documento (¿permiso o red?).'),
      onSuccess: () => { if (inputRef.current) inputRef.current.value = '' },
    })
  }

  const list = documents ?? []

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Documentos</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input ref={inputRef} type="file" aria-label="archivo" accept=".pdf,.xlsx,.xls"
          style={{ color: 'var(--text)', fontSize: 13 }} />
        <button aria-label="subir" onClick={onUpload} disabled={upload.isPending}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          Subir
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>Sin documentos</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((d) => (
            <div key={d.id} data-testid="document-item"
              style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{d.filename}</span>
                <span className="mono" style={{ fontSize: 11, color: badgeColor[d.status] ?? '#888' }}>{d.status}</span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{d.created_at}</div>
              {d.status === 'failed' && d.error && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{d.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
