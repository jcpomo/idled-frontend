'use client'
import { useState } from 'react'
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/lib/queries'
import type { TaskComment } from '@/lib/types'

const labelStyle = { fontSize: 11, color: '#888', marginBottom: 8, display: 'block' } as const

function CommentItem({ comment, taskId }: { comment: TaskComment; taskId: string }) {
  const update = useUpdateComment(taskId)
  const del = useDeleteComment(taskId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.content)
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{ padding: 8, marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginBottom: 4 }}>
        <span>{comment.author_name ?? '—'}</span>
        <span>{comment.created_at}{comment.edited_at ? ' (editado)' : ''}</span>
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea aria-label="editar contenido" value={draft} rows={2}
            onChange={(e) => setDraft(e.target.value)}
            style={{ width: '100%', padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button aria-label="guardar comentario"
              onClick={() => { if (draft.trim()) { update.mutate({ commentId: comment.id, content: draft.trim() }); setEditing(false) } }}
              style={{ padding: '4px 10px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Guardar</button>
            <button onClick={() => { setDraft(comment.content); setEditing(false) }}
              style={{ padding: '4px 10px', background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text)', fontSize: 13, whiteSpace: 'pre-wrap' }}>{comment.content}</div>
      )}
      {comment.mine && !editing && (
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button aria-label="editar comentario" onClick={() => { setDraft(comment.content); setEditing(true) }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Editar</button>
          {confirming ? (
            <button onClick={() => del.mutate(comment.id)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Confirmar borrado</button>
          ) : (
            <button aria-label="borrar comentario" onClick={() => setConfirming(true)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Borrar</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function CommentsSection({ taskId }: { taskId: string }) {
  const { data: comments } = useComments(taskId)
  const create = useCreateComment(taskId)
  const [text, setText] = useState('')

  return (
    <div style={{ marginTop: 18 }}>
      <span style={labelStyle}>Comentarios</span>
      {(comments ?? []).map((c) => <CommentItem key={c.id} comment={c} taskId={taskId} />)}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input aria-label="nuevo comentario" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un comentario…"
          style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
        <button aria-label="enviar comentario"
          onClick={() => { if (text.trim()) { create.mutate(text.trim()); setText('') } }}
          style={{ padding: '6px 10px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>Enviar</button>
      </div>
    </div>
  )
}
