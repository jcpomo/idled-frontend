'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMyTasks } from '@/lib/queries'
import { filterMyTasks, type MyTasksFilter } from '@/lib/dashboard'
import { todayISO } from '@/lib/dates'
import type { MyTask } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--orange)', progress: 'var(--blue)', review: 'var(--accent)', done: 'var(--green)',
}
const CHIPS: { key: MyTasksFilter; label: string }[] = [
  { key: 'all', label: 'Mis tareas' }, { key: 'today', label: 'Hoy' },
  { key: 'overdue', label: 'Atrasadas' }, { key: 'week', label: 'Esta semana' },
]

export default function MyTasksCard() {
  const router = useRouter()
  const { data, isError } = useMyTasks()
  const [filter, setFilter] = useState<MyTasksFilter>('all')
  const today = todayISO()
  const all: MyTask[] = Array.isArray(data) ? data : []
  const rows = filterMyTasks(all, filter, today)

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ width: 7, height: 18, background: 'var(--accent)', borderRadius: 3 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Mis tareas de hoy</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: '#7a7a7a' }}>{rows.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {CHIPS.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit',
              fontWeight: 600, background: filter === c.key ? 'rgba(250,197,28,.12)' : 'var(--bg-5)',
              color: filter === c.key ? 'var(--accent)' : '#c0c0c0' }}>{c.label}</button>
        ))}
      </div>
      {isError ? (
        <div style={{ color: 'var(--red)', fontSize: 13 }}>No se pudieron cargar tus tareas</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#7a7a7a', fontSize: 13 }}>No tienes tareas asignadas</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map((t) => {
            const overdue = t.due_date != null && t.due_date < today
            const dueColor = overdue ? 'var(--red)' : t.due_date === today ? 'var(--accent)' : '#8a8a8a'
            return (
              <div key={t.id} onClick={() => router.push(`/project/${t.project_id}`)} className="row-hover"
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 10, background: 'var(--bg-4)', cursor: 'pointer' }}>
                <span style={{ width: 4, height: 30, borderRadius: 3, flex: '0 0 auto', background: STATUS_COLOR[t.status] ?? '#8a8a8a' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div className="mono" style={{ fontSize: 11, color: dueColor, marginTop: 2 }}>
                    {t.due_date ?? 'sin fecha'} · {t.project_name}
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 11, color: '#8a8a8a' }}>{t.subtask_done}/{t.subtask_total}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
