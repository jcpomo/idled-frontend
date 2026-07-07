'use client'
import { useState } from 'react'
import Board from './Board'
import TaskListView from './TaskListView'

const VIEW_KEY = 'idled_project_view'
type View = 'board' | 'list'

function initialView(): View {
  if (typeof window === 'undefined') return 'board'
  return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'
}

const btn = (active: boolean) => ({
  padding: '6px 14px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
  background: active ? 'var(--accent)' : 'var(--bg-4)', color: active ? '#000' : 'var(--text)',
} as const)

export default function ProjectView({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>(initialView)

  function choose(next: View) {
    setView(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', padding: '8px 24px 0' }}>
        <button data-testid="view-toggle-board" aria-pressed={view === 'board'} onClick={() => choose('board')}
          style={{ ...btn(view === 'board'), borderRadius: '8px 0 0 8px' }}>Tablero</button>
        <button data-testid="view-toggle-list" aria-pressed={view === 'list'} onClick={() => choose('list')}
          style={{ ...btn(view === 'list'), borderRadius: '0 8px 8px 0', borderLeft: 'none' }}>Lista</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {view === 'board' ? <Board projectId={projectId} /> : <TaskListView projectId={projectId} />}
      </div>
    </div>
  )
}
