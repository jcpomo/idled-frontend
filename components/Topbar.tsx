'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useNotifications, useProjects, useSearch } from '@/lib/queries'

function useBreadcrumb(): { top: string; main: string } {
  const pathname = usePathname()
  const { data: projects } = useProjects()
  if (pathname.startsWith('/project/')) {
    const id = pathname.split('/')[2]
    const p = (Array.isArray(projects) ? projects : []).find((x) => x.id === id)
    return { top: 'Proyecto', main: p?.name ?? 'Proyecto' }
  }
  const map: Record<string, { top: string; main: string }> = {
    '/dashboard': { top: 'Inicio', main: 'Dashboard' },
    '/assistant': { top: 'IA', main: 'Asistente IA' },
    '/documentos': { top: 'Archivos', main: 'Documentos' },
    '/chat': { top: 'Equipo', main: 'Chat de equipo' },
    '/notifications': { top: 'Actividad', main: 'Notificaciones' },
  }
  return map[pathname] ?? { top: 'IMASD', main: 'Inicio' }
}

export default function Topbar() {
  const router = useRouter()
  const crumb = useBreadcrumb()
  const { data: notifs } = useNotifications()
  const unread = (Array.isArray(notifs) ? notifs : []).filter((n) => !n.read).length
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results, isError } = useSearch(q)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function go(path: string) {
    setOpen(false)
    setQ('')
    router.push(path)
  }

  return (
    <header style={{ height: 62, flex: '0 0 62px', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', background: 'var(--bg-1)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 150 }}>
        <span style={{ fontSize: 11, color: '#6a6a6a' }}>{crumb.top}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{crumb.main}</span>
      </div>
      <button onClick={() => router.push('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#161616',
          border: 'none', borderRadius: 9, padding: '9px 15px', fontFamily: 'inherit', fontWeight: 700,
          fontSize: 13, cursor: 'pointer' }}>+ Nueva tarea</button>
      <button aria-label="notificaciones" onClick={() => router.push('/notifications')}
        style={{ position: 'relative', cursor: 'pointer', width: 38, height: 38, borderRadius: 9,
          background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#cfcfcf' }}>
        🔔
        {unread > 0 && <span style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8,
          borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-3)' }} />}
      </button>
      <div style={{ position: 'relative', flex: 1, maxWidth: 520, margin: '0 auto' }}>
        <input ref={inputRef} value={q} placeholder="Buscar tareas, proyectos…  (⌘K)"
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          style={{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '9px 13px', color: 'var(--text)', fontSize: 13.5,
            fontFamily: 'inherit', outline: 'none' }} />
        {open && q.trim().length >= 2 && (
          <div style={{ position: 'absolute', top: 44, left: 0, right: 0, background: 'var(--bg-4)',
            border: '1px solid var(--border)', borderRadius: 12, padding: 8, zIndex: 40,
            boxShadow: '0 14px 40px rgba(0,0,0,.5)', maxHeight: 380, overflow: 'auto' }}>
            {isError && (
              <div style={{ padding: 10, color: 'var(--red)', fontSize: 13 }}>No se pudo buscar</div>
            )}
            {!isError && (results?.projects.length ?? 0) === 0 && (results?.tasks.length ?? 0) === 0 && (
              <div style={{ padding: 10, color: '#7a7a7a', fontSize: 13 }}>Sin resultados</div>
            )}
            {(results?.projects ?? []).length > 0 && (
              <div style={{ fontSize: 10, color: '#7a7a7a', fontWeight: 700, padding: '6px 9px' }}>PROYECTOS</div>
            )}
            {(results?.projects ?? []).map((p) => (
              <div key={p.id} className="row-hover" onClick={() => go(`/project/${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{p.name}</span>
              </div>
            ))}
            {(results?.tasks ?? []).length > 0 && (
              <div style={{ fontSize: 10, color: '#7a7a7a', fontWeight: 700, padding: '6px 9px' }}>TAREAS</div>
            )}
            {(results?.tasks ?? []).map((t) => (
              <div key={t.id} className="row-hover" onClick={() => go(`/project/${t.project_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{t.title}</span>
                <span className="mono" style={{ fontSize: 11, color: '#7a7a7a', marginLeft: 'auto' }}>{t.project_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
