# Vista Lista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una vista Lista (tareas agrupadas por estado, filas de lectura) como alternativa al tablero Kanban en la página del proyecto, con un toggle Tablero/Lista cuya preferencia se recuerda en localStorage.

**Architecture:** Solo frontend. Un componente `TaskListView` pinta las tareas de `useTasks` agrupadas por los 4 estados (reutilizando `COLUMNS` de `Board`), con click en fila abriendo el `TaskDetailPanel` existente. Un envoltorio `ProjectView` mantiene el estado de vista (persistido en localStorage) y alterna entre `Board` y `TaskListView`; la página del proyecto pasa a renderizar `ProjectView`.

**Tech Stack:** Next.js 14.2 App Router + React 18 + TypeScript + @tanstack/react-query. Tests vitest + @testing-library/react en host.

## Global Constraints

- **Solo frontend** — sin cambios de backend, sin migraciones. Reutiliza `useTasks(projectId)`, `useMembers(projectId)`, `TaskDetailPanel`, y `COLUMNS` (exportado de `components/kanban/Board.tsx`).
- **localStorage key:** `'idled_project_view'`, valores `'board'` | `'list'`, **default `'board'`**.
- **Grupos:** los 4 estados en el orden de `COLUMNS` (OPEN / IN PROGRESS / REVIEW / DONE), **siempre visibles** con su contador, filas ordenadas por `position` asc.
- **Fila de lectura:** título; asignado = `t.assignee ? (memberNames[t.assignee] ?? t.assignee) : 'Sin asignar'`; fecha = `t.due_date || '—'`; tipo = `t.task_type`. Sin edición inline ni drag.
- **Resolución de nombre:** `memberNames[external_id] = name ?? external_id` (mismo patrón que `Board`).
- **testids:** `view-toggle-board`, `view-toggle-list`, `group-header`, `task-row`.
- **Tests en host:** `npx vitest run <archivo>`. NO Docker.
- **No `git add -A`** — el repo tiene `.superpowers/` (ledger) y artefactos de build que NO se commitean; añade solo los archivos que cada tarea lista.
- `Task` type (existente): `{ id, title, task_type, status, assignee: string|null, due_date: string|null, position, description: string|null, parent_id: string|null }`.
- `TaskStatus` = `'open' | 'progress' | 'review' | 'done'`.

---

### Task 1: `TaskListView` — lista agrupada por estado

**Files:**
- Create: `components/kanban/TaskListView.tsx`
- Test: `tests/task-list-view.test.tsx`

**Interfaces:**
- Consumes: `useTasks(projectId)` → `{ data: Task[] | undefined, isLoading: boolean }`; `useMembers(projectId)` → `{ data: Member[] | undefined }` where `Member` has `{ external_id: string, name: string | null }`; `COLUMNS` from `./Board` = `{ key: TaskStatus; label: string }[]` in order open/progress/review/done; `TaskDetailPanel` (default export) props `{ taskId, projectId, onClose }`.
- Produces: `TaskListView` (default export), props `{ projectId: string }`.

- [ ] **Step 1: Write the failing test** — crear `tests/task-list-view.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

vi.mock('@/components/kanban/TaskDetailPanel', () => ({
  default: ({ taskId }: { taskId: string }) => <div data-testid="detail-panel">{taskId}</div>,
}))

beforeEach(() => vi.restoreAllMocks())

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: `T-${id}`, task_type: 'PPTO', status: 'open', assignee: null,
  due_date: null, position: 0, description: null, parent_id: null, ...over,
})

function stub(tasks: Task[], members: { external_id: string; name: string | null }[] = []) {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: members } as never)
}

it('groups tasks by status with counts', async () => {
  stub([task('1', { status: 'open' }), task('2', { status: 'done' }), task('3', { status: 'open' })])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  const headers = screen.getAllByTestId('group-header').map((h) => h.textContent)
  expect(headers).toEqual(['OPEN · 2', 'IN PROGRESS · 0', 'REVIEW · 0', 'DONE · 1'])
  expect(screen.getAllByTestId('task-row')).toHaveLength(3)
})

it('resolves the assignee name, falling back to Sin asignar', async () => {
  stub([task('1', { assignee: 'ext-9' }), task('2', { assignee: null })],
       [{ external_id: 'ext-9', name: 'Marta' }])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.getByText('Marta')).toBeInTheDocument()
  expect(screen.getByText('Sin asignar')).toBeInTheDocument()
})

it('opens the detail panel with the clicked task id', async () => {
  stub([task('42', { status: 'review' })])
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.queryByTestId('detail-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('task-row'))
  expect(screen.getByTestId('detail-panel')).toHaveTextContent('42')
})

it('shows Cargando while loading', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: undefined, isLoading: true } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
  const { default: View } = await import('@/components/kanban/TaskListView')
  render(<View projectId="p1" />)
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/task-list-view.test.tsx`
Expected: FAIL (no existe `@/components/kanban/TaskListView`).

- [ ] **Step 3: Create the component** — `components/kanban/TaskListView.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useTasks, useMembers } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import TaskDetailPanel from './TaskDetailPanel'
import { COLUMNS } from './Board'

const headerStyle = {
  fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 6px',
} as const
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
  padding: '10px 12px', marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
} as const

export default function TaskListView({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const { data: members } = useMembers(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>

  const memberNames: Record<string, string> = {}
  for (const m of members ?? []) memberNames[m.external_id] = m.name ?? m.external_id
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)

  return (
    <>
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        {COLUMNS.map((col) => {
          const rows = byStatus(col.key)
          return (
            <div key={col.key}>
              <div data-testid="group-header" style={headerStyle}>{col.label} · {rows.length}</div>
              {rows.map((t) => (
                <button key={t.id} data-testid="task-row" onClick={() => setSelectedId(t.id)} style={rowStyle}>
                  <span style={{ flex: 1 }}>{t.title}</span>
                  <span style={{ fontSize: 12, color: '#bbb', minWidth: 120 }}>
                    {t.assignee ? (memberNames[t.assignee] ?? t.assignee) : 'Sin asignar'}
                  </span>
                  <span style={{ fontSize: 12, color: '#bbb', minWidth: 90 }}>{t.due_date || '—'}</span>
                  <span className="mono" style={{ fontSize: 11, color: '#888', minWidth: 70 }}>{t.task_type}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
      {selectedId && (
        <TaskDetailPanel key={selectedId} taskId={selectedId} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/task-list-view.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/kanban/TaskListView.tsx tests/task-list-view.test.tsx
git commit -m "feat: task list view grouped by status"
```

---

### Task 2: `ProjectView` — toggle Tablero/Lista + wiring de la página

**Files:**
- Create: `components/kanban/ProjectView.tsx`
- Modify: `app/(app)/project/[id]/page.tsx`
- Test: `tests/project-view.test.tsx`

**Interfaces:**
- Consumes: `Board` (default export, props `{ projectId }`) from `./Board`; `TaskListView` (Task 1, default export, props `{ projectId }`) from `./TaskListView`.
- Produces: `ProjectView` (default export), props `{ projectId: string }`.

- [ ] **Step 1: Write the failing test** — crear `tests/project-view.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/components/kanban/Board', () => ({ default: () => <div data-testid="board-view" /> }))
vi.mock('@/components/kanban/TaskListView', () => ({ default: () => <div data-testid="list-view" /> }))

beforeEach(() => { vi.restoreAllMocks(); window.localStorage.clear() })

it('defaults to the board view', async () => {
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  expect(screen.getByTestId('board-view')).toBeInTheDocument()
  expect(screen.queryByTestId('list-view')).not.toBeInTheDocument()
})

it('switches to the list view and persists the choice', async () => {
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  fireEvent.click(screen.getByTestId('view-toggle-list'))
  expect(screen.getByTestId('list-view')).toBeInTheDocument()
  expect(screen.queryByTestId('board-view')).not.toBeInTheDocument()
  expect(window.localStorage.getItem('idled_project_view')).toBe('list')
})

it('starts in the list view when localStorage says so', async () => {
  window.localStorage.setItem('idled_project_view', 'list')
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  expect(screen.getByTestId('list-view')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/project-view.test.tsx`
Expected: FAIL (no existe `@/components/kanban/ProjectView`).

- [ ] **Step 3: Create the component** — `components/kanban/ProjectView.tsx`

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/project-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the project page** — reemplaza `app/(app)/project/[id]/page.tsx` por:

```tsx
import TeamPanel from '@/components/kanban/TeamPanel'
import TeamChatPanel from '@/components/kanban/TeamChatPanel'
import ProjectView from '@/components/kanban/ProjectView'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TeamPanel projectId={params.id} />
        <TeamChatPanel projectId={params.id} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ProjectView projectId={params.id} />
      </div>
    </div>
  )
}
```

(Nota: se elimina el `import Board` directo — ahora `ProjectView` lo gestiona.)

- [ ] **Step 6: Run the full suite (regression guard) + build**

Run: `npx vitest run`
Expected: PASS (toda la suite, incluidos los dos nuevos archivos).

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 7: Commit**

```bash
git add components/kanban/ProjectView.tsx "app/(app)/project/[id]/page.tsx" tests/project-view.test.tsx
git commit -m "feat: project view toggle (board/list) with persisted preference"
```

---

## Notas de cierre

- Tras la Tarea 2: revisión final de rama completa (solo frontend), luego `finishing-a-development-branch` + push del repo frontend.
- **Fuera de alcance (recordatorio):** edición inline en fila, ordenar por columnas, filtros, drag en la lista, subtareas anidadas en la lista, preferencia de vista en servidor, Gantt.
- **Backlog fast-follow heredado:** `--text-muted` para grises `#888`/`#bbb`, formato de fechas, `enabled` de members/users, flash de estados vacíos.
