# Detalle de Tarea (panel + edición) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a right-side drawer from a Kanban card to view and edit a task's fields (title, description, type, assignee, date, status) with per-field auto-save, plus delete, wired to the existing FastAPI backend.

**Architecture:** Task 1 adds a `description` column to the backend `Task` (+ Alembic migration) and threads it through the service and every task serializer. Tasks 2–4 are frontend: the data layer (types + API + hooks), the `TaskDetailPanel` drawer, and the board wiring that opens it on card click (a dnd-kit activation distance keeps click distinct from drag). Status changes route through the existing `move` endpoint (append to end of target column) so Kanban positions stay consistent; every other field goes through `PATCH /api/tasks/{id}`. The panel reads the selected task and destination-column counts from the already-loaded `['tasks', projectId]` cache — no new GET endpoint.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (runs in Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, @dnd-kit/core, vitest + @testing-library/react (runs on host).

## Global Constraints

- **Two repos.** Task 1 is in the BACKEND repo `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 2–4 are in the FRONTEND repo `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit in the repo where the files live.
- **Ownership security, no new RBAC.** Access to another user's task returns **404, never 403** (existing pattern via `get_owned_task` JOIN). Never leak `description` across users.
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>` from the backend repo. Tests build tables from `Base.metadata.create_all` (NOT migrations), so a model field is visible to tests without the migration; the Alembic migration is for the real DB only.
- **Frontend tests run on the HOST:** `npx vitest run <path>` from the frontend repo (Node on host, not Docker).
- **Clearing a text field sends `""`, not `null`.** `update_task` ignores `None` (pattern `if X is not None`), so an emptied field is persisted as an empty string.
- **Status change from the panel uses `move`, not PATCH.** `position` = count of tasks already in the destination status (append to end).
- **Dark design tokens only** from `app/globals.css` (`--bg`, `--bg-1`..`--bg-5`, `--border`, `--text`, `--accent`). Reuse `.mono` where monospace is wanted.
- **Panel props are exactly `{ task: Task; projectId: string; onClose: () => void }`.** It reads counts/list from `useTasks(projectId)` (same cache).
- DRY, YAGNI, TDD, frequent commits. No subtasks/comments/tags/time — out of scope.

---

## File Structure

**Backend (`idled-backend`):**
- `app/gestor/models.py` — `Task` gains `description` (Text, nullable).
- `migrations/versions/e3f1a2b4c5d6_task_description.py` — NEW Alembic migration (down_revision `92b25fd2f208`).
- `app/gestor/service.py` — `update_task` gains a `description` keyword.
- `app/api/tasks.py` — `TaskUpdateBody` gains `description`; PATCH passes it; `_task_dict` returns it.
- `app/api/projects.py` — `_task_dict` returns `description`.
- Tests: `tests/test_gestor_models.py`, `tests/test_gestor_tasks_service.py`, `tests/test_tasks_endpoint.py`, `tests/test_projects_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/types.ts` — `Task` gains `description`.
- `lib/api.ts` — `updateTask` patch type gains `description`; new `deleteTask` wrapper.
- `lib/queries.ts` — new `useUpdateTask(projectId)`, new `useDeleteTask(projectId)`.
- `components/kanban/TaskDetailPanel.tsx` — NEW drawer.
- `components/kanban/Board.tsx` — `selectedId` state, `PointerSensor` with activation distance, render the panel.
- `components/kanban/Column.tsx` — thread `onOpen` to a card click handler.
- Tests: `tests/task-mutations.test.tsx` (NEW), `tests/task-detail-panel.test.tsx` (NEW), `tests/kanban-open.test.tsx` (NEW).

---

### Task 1: Backend `description` field, service, serialization, migration

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/models.py`, `app/gestor/service.py`, `app/api/tasks.py`, `app/api/projects.py`
- Create: `migrations/versions/e3f1a2b4c5d6_task_description.py`
- Test: `tests/test_gestor_models.py`, `tests/test_gestor_tasks_service.py`, `tests/test_tasks_endpoint.py`, `tests/test_projects_endpoint.py`

**Interfaces:**
- Consumes: existing `create_project`, `create_task`, `get_owned_task`, `update_task`, `list_tasks` from `app.gestor.service`; existing conftest `session` fixture and the `client`/`_token`/`_make_task` helpers in the endpoint tests.
- Produces: `Task.description: str | None`; `update_task(..., description: str | None = None)`; every task JSON now includes a `"description"` key.

- [ ] **Step 1: Write the failing model + service tests**

Append to `tests/test_gestor_models.py`:

```python
def test_task_has_description_column():
    cols = set(Task.__table__.columns.keys())
    assert "description" in cols
```

Append to `tests/test_gestor_tasks_service.py`:

```python
@pytest.mark.asyncio
async def test_update_task_persists_description_including_empty(session):
    p = await create_project(session, "ext-1", "P")
    t = await create_task(session, p.id, "ext-1", title="a")
    upd = await update_task(session, t.id, "ext-1", description="hola")
    assert upd.description == "hola"
    # clearing sends "" (not None); None is ignored by update_task
    cleared = await update_task(session, t.id, "ext-1", description="")
    assert cleared.description == ""
    # None leaves the value untouched
    untouched = await update_task(session, t.id, "ext-1", description=None)
    assert untouched.description == ""
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_gestor_models.py::test_task_has_description_column tests/test_gestor_tasks_service.py::test_update_task_persists_description_including_empty -v`
Expected: FAIL — `description` not a column / `update_task() got an unexpected keyword argument 'description'`.

- [ ] **Step 3: Add the column to the model**

In `app/gestor/models.py`, add `Text` to the sqlalchemy import and a `description` column to `Task` (place it after `title`):

```python
from sqlalchemy import String, Integer, DateTime, Uuid, func, Text
```
```python
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 4: Add the `description` keyword to `update_task`**

In `app/gestor/service.py`, extend the `update_task` signature and body:

```python
async def update_task(
    session: AsyncSession, task_id: uuid.UUID, user_external_id: str, *,
    title: str | None = None, task_type: str | None = None,
    assignee: str | None = None, due_date: str | None = None,
    description: str | None = None,
) -> Task | None:
    task = await get_owned_task(session, task_id, user_external_id)
    if task is None:
        return None
    if title is not None:
        task.title = title
    if task_type is not None:
        task.task_type = task_type
    if assignee is not None:
        task.assignee = assignee
    if due_date is not None:
        task.due_date = due_date
    if description is not None:
        task.description = description
    await session.commit()
    await session.refresh(task)
    return task
```

- [ ] **Step 5: Run the model + service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_gestor_models.py::test_task_has_description_column tests/test_gestor_tasks_service.py::test_update_task_persists_description_including_empty -v`
Expected: PASS.

- [ ] **Step 6: Write the failing endpoint tests**

Append to `tests/test_tasks_endpoint.py`:

```python
@pytest.mark.asyncio
async def test_patch_returns_description(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        r = await ac.patch(f"/api/tasks/{tid}", json={"description": "detalle"}, headers=h)
        assert r.status_code == 200
        assert r.json()["description"] == "detalle"
```

Append to `tests/test_projects_endpoint.py` (this file already builds a project + task via the `client` fixture and `_token`; mirror its existing helper style):

```python
@pytest.mark.asyncio
async def test_task_list_includes_description(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "a"}, headers=h)
        tasks = (await ac.get(f"/api/projects/{pid}/tasks", headers=h)).json()
        assert "description" in tasks[0]
```

> If `test_projects_endpoint.py` does not already define `_token`, import it from the tasks endpoint test is NOT allowed (tests should be self-contained); instead copy the same `SECRET` + `_token` helper used in `tests/test_tasks_endpoint.py` into this file's top if missing. Check first and reuse the existing one.

- [ ] **Step 7: Run the endpoint tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_tasks_endpoint.py::test_patch_returns_description tests/test_projects_endpoint.py::test_task_list_includes_description -v`
Expected: FAIL — response JSON has no `"description"` key (KeyError) and PATCH body drops the field.

- [ ] **Step 8: Thread `description` through the API layer**

In `app/api/tasks.py`, add the field to the body model, pass it through, and serialize it:

```python
class TaskUpdateBody(BaseModel):
    title: str | None = None
    task_type: str | None = None
    assignee: str | None = None
    due_date: str | None = None
    description: str | None = None
```
```python
def _task_dict(t) -> dict:
    return {"id": str(t.id), "title": t.title, "task_type": t.task_type,
            "status": t.status, "assignee": t.assignee, "due_date": t.due_date,
            "position": t.position, "description": t.description}
```
```python
    t = await update_task(session, task_id, user.external_id, title=body.title,
                          task_type=body.task_type, assignee=body.assignee,
                          due_date=body.due_date, description=body.description)
```

In `app/api/projects.py`, add `description` to its `_task_dict`:

```python
def _task_dict(t) -> dict:
    return {"id": str(t.id), "title": t.title, "task_type": t.task_type,
            "status": t.status, "assignee": t.assignee, "due_date": t.due_date,
            "position": t.position, "description": t.description}
```

- [ ] **Step 9: Run the endpoint tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_tasks_endpoint.py::test_patch_returns_description tests/test_projects_endpoint.py::test_task_list_includes_description -v`
Expected: PASS.

- [ ] **Step 10: Create the Alembic migration (real-DB parity)**

Create `migrations/versions/e3f1a2b4c5d6_task_description.py`:

```python
"""task description

Revision ID: e3f1a2b4c5d6
Revises: 92b25fd2f208
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3f1a2b4c5d6'
down_revision: Union[str, Sequence[str], None] = '92b25fd2f208'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tasks', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'description')
```

Verify the migration applies against the running DB:

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `e3f1a2b4c5d6` with no error (or reports already at head if the DB isn't up — in that case at least confirm `docker compose run --rm api alembic history` lists the new revision after `92b25fd2f208`).

- [ ] **Step 11: Run the full backend suite**

Run: `docker compose run --rm api pytest -q`
Expected: all pass (prior suite + the 4 new tests).

- [ ] **Step 12: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add -A
git commit -m "feat: add task description field, serialization, and migration"
```

---

### Task 2: Frontend data layer — types, deleteTask, update/delete hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`
- Test: `tests/task-mutations.test.tsx` (create)

**Interfaces:**
- Consumes: existing `apiFetch`, `updateTask`, `getToken`, `useMutation`/`useQueryClient`.
- Produces:
  - `Task.description: string | null`.
  - `deleteTask(token: string, taskId: string): Promise<{ deleted: boolean }>`.
  - `updateTask` patch type now includes `description?: string`.
  - `useUpdateTask(projectId: string)` → mutation, `mutate(v: { taskId: string; patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string } })`, invalidates `['tasks', projectId]`.
  - `useDeleteTask(projectId: string)` → mutation, `mutate(taskId: string)`, invalidates `['tasks', projectId]`.

- [ ] **Step 1: Write the failing test** — `tests/task-mutations.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useUpdateTask, useDeleteTask } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useUpdateTask patches the task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'updateTask').mockResolvedValue({} as never)
  const { result } = renderHook(() => useUpdateTask('p1'), { wrapper: wrapper() })
  result.current.mutate({ taskId: 't1', patch: { description: 'x' } })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', { description: 'x' }))
})

it('useDeleteTask deletes the task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'deleteTask').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useDeleteTask('p1'), { wrapper: wrapper() })
  result.current.mutate('t1')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-mutations.test.tsx`
Expected: FAIL — `useUpdateTask`/`useDeleteTask`/`api.deleteTask` not exported.

- [ ] **Step 3: Add `description` to the Task type** — `lib/types.ts`

```ts
export interface Task {
  id: string
  title: string
  task_type: string
  status: TaskStatus
  assignee: string | null
  due_date: string | null
  position: number
  description: string | null
}
```

- [ ] **Step 4: Add `description` to the patch type and a `deleteTask` wrapper** — `lib/api.ts`

Replace the `updateTask` export and append `deleteTask`:

```ts
export const updateTask = (
  token: string,
  taskId: string,
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string },
) => apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch, token })

export const deleteTask = (token: string, taskId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE', token })
```

- [ ] **Step 5: Add the hooks** — `lib/queries.ts`

Append:

```ts
export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      taskId: string
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string }
    }) => api.updateTask(token(), v.taskId, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(token(), taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-mutations.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: task description type, deleteTask api, update/delete hooks"
```

---

### Task 3: `TaskDetailPanel` drawer with per-field auto-save and delete

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `components/kanban/TaskDetailPanel.tsx`, `tests/task-detail-panel.test.tsx`

**Interfaces:**
- Consumes: `useUpdateTask`, `useMoveTask`, `useDeleteTask`, `useTasks` from `@/lib/queries`; `Task`, `TaskStatus` from `@/lib/types`.
- Produces: `TaskDetailPanel({ task, projectId, onClose }: { task: Task; projectId: string; onClose: () => void })` — default export. Root element has `data-testid="task-detail-panel"`.

**Behavior notes for the implementer:**
- Each text field holds local state seeded from `task`; on **blur**, if the value differs from the task's current value, call `update.mutate({ taskId, patch: { <field>: value } })`. Description empty string is sent as `""` (do not convert to null).
- The **status** `<select>` (value = `task.status`) calls, on change: `move.mutate({ taskId, status: next, position })` where `position` = number of tasks in `tasks` (from `useTasks(projectId)`) whose `status === next`.
- **Delete** is a two-step inline confirm (no `window.confirm`): first click sets a `confirming` state showing a "Confirmar borrado" button; that button calls `del.mutate(task.id)` then `onClose()`.
- Close on the X button, on backdrop click, and on Escape (a `keydown` effect).

- [ ] **Step 1: Write the failing test** — `tests/task-detail-panel.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const task: Task = {
  id: 't1', title: 'Estudio', task_type: 'PPTO', status: 'open',
  assignee: 'ED', due_date: null, position: 0, description: 'desc inicial',
}
const others: Task[] = [
  task,
  { id: 't2', title: 'Otra', task_type: 'PPTO', status: 'done', assignee: null, due_date: null, position: 0, description: null },
]

function stub() {
  const update = vi.fn()
  const move = vi.fn()
  const del = vi.fn()
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: move } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: del } as never)
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: others, isLoading: false } as never)
  return { update, move, del }
}

it('renders the task fields including description', async () => {
  stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Estudio')
  expect((screen.getByLabelText('descripción') as HTMLTextAreaElement).value).toBe('desc inicial')
})

it('blurring the title with a change patches the title', async () => {
  const { update } = stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  const title = screen.getByLabelText('título')
  fireEvent.change(title, { target: { value: 'Nuevo' } })
  fireEvent.blur(title)
  expect(update).toHaveBeenCalledWith({ taskId: 't1', patch: { title: 'Nuevo' } })
})

it('changing status moves the task appended to the destination column', async () => {
  const { move } = stub()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  // one task already in 'done' among `others` -> position 1
  expect(move).toHaveBeenCalledWith({ taskId: 't1', status: 'done', position: 1 })
})

it('deleting requires a confirm click then deletes and closes', async () => {
  const { del } = stub()
  const onClose = vi.fn()
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel task={task} projectId="p1" onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado' }))
  expect(del).toHaveBeenCalledWith('t1')
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-detail-panel.test.tsx`
Expected: FAIL — cannot resolve `@/components/kanban/TaskDetailPanel`.

- [ ] **Step 3: Create `components/kanban/TaskDetailPanel.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useUpdateTask, useMoveTask, useDeleteTask, useTasks } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'OPEN' },
  { value: 'progress', label: 'IN PROGRESS' },
  { value: 'review', label: 'REVIEW' },
  { value: 'done', label: 'DONE' },
]

const labelStyle = { fontSize: 11, color: '#888', marginBottom: 4, display: 'block' } as const
const fieldStyle = {
  width: '100%', padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', marginBottom: 14,
} as const

export default function TaskDetailPanel({
  task, projectId, onClose,
}: { task: Task; projectId: string; onClose: () => void }) {
  const update = useUpdateTask(projectId)
  const move = useMoveTask(projectId)
  const del = useDeleteTask(projectId)
  const { data: tasks } = useTasks(projectId)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [taskType, setTaskType] = useState(task.task_type)
  const [assignee, setAssignee] = useState(task.assignee ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function patchIfChanged(field: string, value: string, current: string) {
    if (value !== current) update.mutate({ taskId: task.id, patch: { [field]: value } })
  }

  function onStatusChange(next: TaskStatus) {
    const position = (tasks ?? []).filter((t) => t.status === next).length
    move.mutate({ taskId: task.id, status: next, position })
  }

  function onDelete() {
    del.mutate(task.id)
    onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }}
      />
      <aside
        data-testid="task-detail-panel"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button aria-label="cerrar" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <label htmlFor="td-title" style={labelStyle}>Título</label>
        <input id="td-title" aria-label="título" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => patchIfChanged('title', title, task.title)}
          style={fieldStyle} />

        <label htmlFor="td-desc" style={labelStyle}>Descripción</label>
        <textarea id="td-desc" aria-label="descripción" value={description} rows={4}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => patchIfChanged('description', description, task.description ?? '')}
          style={{ ...fieldStyle, resize: 'vertical' }} />

        <label htmlFor="td-type" style={labelStyle}>Tipo</label>
        <input id="td-type" aria-label="tipo" value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          onBlur={() => patchIfChanged('task_type', taskType, task.task_type)}
          style={fieldStyle} />

        <label htmlFor="td-assignee" style={labelStyle}>Asignado</label>
        <input id="td-assignee" aria-label="asignado" value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          onBlur={() => patchIfChanged('assignee', assignee, task.assignee ?? '')}
          style={fieldStyle} />

        <label htmlFor="td-due" style={labelStyle}>Fecha</label>
        <input id="td-due" aria-label="fecha" type="date" value={dueDate}
          onChange={(e) => { setDueDate(e.target.value); }}
          onBlur={() => patchIfChanged('due_date', dueDate, task.due_date ?? '')}
          style={fieldStyle} />

        <label htmlFor="td-status" style={labelStyle}>Estado</label>
        <select id="td-status" aria-label="estado" value={task.status}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
          style={fieldStyle}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          {confirming ? (
            <button onClick={onDelete}
              style={{ width: '100%', padding: 10, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Confirmar borrado
            </button>
          ) : (
            <button onClick={() => setConfirming(true)}
              style={{ width: '100%', padding: 10, background: 'none', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer' }}>
              Eliminar
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
```

> `var(--red)` exists in `app/globals.css` (verified). If a lint/build error says otherwise, fall back to `#E5484D`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-detail-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: task detail drawer with per-field auto-save and delete"
```

---

### Task 4: Wire opening the panel from the board (click vs drag)

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `components/kanban/Board.tsx`, `components/kanban/Column.tsx`
- Test: `tests/kanban-open.test.tsx` (create)

**Interfaces:**
- Consumes: `TaskDetailPanel` (default export); `PointerSensor`, `useSensor`, `useSensors` from `@dnd-kit/core`; existing `useTasks`/`useCreateTask`/`useMoveTask`.
- Produces: `Column` gains an `onOpen: (taskId: string) => void` prop, threaded to a card click handler; `Board` owns `selectedId` state and renders the panel for the selected task.

**Behavior notes:**
- Add a `PointerSensor` with `activationConstraint: { distance: 5 }` so a click (no movement) does not start a drag; a click then reliably fires the card's `onClick`.
- `selectedId` and the sensors are hooks/state — declare them **before** the `if (isLoading) return` early return (Rules of Hooks).
- The panel is rendered with `key={selectedTask.id}` so switching tasks reseeds its field state.

- [ ] **Step 1: Write the failing test** — `tests/kanban-open.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const tasks: Task[] = [
  { id: 't1', title: 'Estudio viabilidad', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 0, description: null },
]

function stub() {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: vi.fn() } as never)
}

it('clicking a card opens the task detail panel', async () => {
  stub()
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  expect(screen.queryByTestId('task-detail-panel')).toBeNull()
  fireEvent.click(screen.getByText('Estudio viabilidad'))
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/kanban-open.test.tsx`
Expected: FAIL — no panel appears on click (Board has no open wiring yet).

- [ ] **Step 3: Thread `onOpen` through `Column`** — `components/kanban/Column.tsx`

Update `Draggable` to accept and fire `onOpen` on click, and `Column` to accept and pass `onOpen`:

```tsx
function Draggable({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onOpen(task.id)} style={{ cursor: 'pointer' }}>
      <TaskCard task={task} />
    </div>
  )
}

export default function Column({
  status, label, tasks, onCreate, onOpen,
}: { status: TaskStatus; label: string; tasks: Task[]; onCreate: (title: string) => void; onOpen: (id: string) => void }) {
  const { setNodeRef } = useDroppable({ id: status })
  const [title, setTitle] = useState('')
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`}
      style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{label}</div>
      {tasks.map((t) => <Draggable key={t.id} task={t} onOpen={onOpen} />)}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input aria-label={`nueva tarea ${status}`} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="+ tarea"
          style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
        <button onClick={() => { if (title.trim()) { onCreate(title.trim()); setTitle('') } }}
          style={{ padding: '6px 8px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>+</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add state, sensors, and the panel to `Board`** — `components/kanban/Board.tsx`

Update the imports and the component body (keep `COLUMNS`, `COLUMN_KEYS`, `resolveMove` exactly as they are):

```tsx
'use client'
import { useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useTasks, useCreateTask, useMoveTask } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import Column from './Column'
import TaskDetailPanel from './TaskDetailPanel'
```

```tsx
export default function Board({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const create = useCreateTask(projectId)
  const move = useMoveTask(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)
  const selectedTask = (tasks ?? []).find((t) => t.id === selectedId) ?? null
  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : null
    const plan = resolveMove(String(e.active.id), over, tasks ?? [])
    if (plan) move.mutate(plan)
  }
  function createForColumn(status: TaskStatus, title: string) {
    create.mutate({ title, status })
  }
  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 14, padding: 24, height: '100%', overflowX: 'auto' }}>
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              status={col.key}
              label={col.label}
              tasks={byStatus(col.key)}
              onCreate={(title) => createForColumn(col.key, title)}
              onOpen={setSelectedId}
            />
          ))}
        </div>
      </DndContext>
      {selectedTask && (
        <TaskDetailPanel key={selectedTask.id} task={selectedTask} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 5: Run the open test + the existing board/interaction tests**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/kanban-open.test.tsx tests/board.test.tsx tests/kanban-interactions.test.tsx`
Expected: all pass. (`tests/board.test.tsx` mocks `useTasks`/`useCreateTask`/`useMoveTask`; `Column` now also requires `onOpen`, which `Board` passes — the render test drives `Board`, so it stays green. The panel is not rendered without a selection.)

- [ ] **Step 6: Run the full vitest suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run
npm run build
```
Expected: all vitest tests pass; build compiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: open task detail panel on card click with drag activation distance"
```

---

## Out of scope (this plan)

- Subtareas / checklist, comentarios, etiquetas/tags, múltiples asignados, prioridad, adjuntos, time tracker → slices posteriores.
- Extender el smoke Playwright para cubrir el panel → slice posterior.
- Select de tipo/asignado a partir de catálogos (tabla de tipos / usuarios) → posterior.
- Recuperación global de 401 / logout → fast-follow ya anotado, no aquí.
- Reorden fino intra-columna al cambiar estado → el cambio de estado añade al final (append), como el drag actual.

## Self-Review

**Spec coverage:**
- `description` field + Alembic migration → Task 1. ✅
- `update_task` acepta `description`; toda serialización lo devuelve (tasks.py + projects.py) → Task 1. ✅
- Aislamiento por usuario (404), vaciar = `""` → Task 1 tests. ✅
- `Task.description` en tipos; `deleteTask` wrapper; `useUpdateTask`/`useDeleteTask` → Task 2. ✅
- Panel drawer con campos + auto-save on blur + estado vía move + eliminar con confirmación + cierre (X/backdrop/Esc) → Task 3. ✅
- Abrir con click en tarjeta + activation distance para no chocar con drag; leer del cache; sin GET nuevo → Task 4 (+ panel lee `useTasks`). ✅
- Tokens dark, props del panel `{task, projectId, onClose}` → Tasks 3–4. ✅

**Placeholder scan:** sin TBD/TODO; todo el código está completo (modelo, migración con revisión fija `e3f1a2b4c5d6`←`92b25fd2f208`, service, ambos serializadores, tipos, api, hooks, panel y wiring). ✅

**Type consistency:** `useUpdateTask` mutate `{ taskId, patch }` coincide entre Task 2 (definición), su test, y el uso en el panel (Task 3). `useDeleteTask` mutate `taskId: string` coincide en Task 2 y Task 3. `Task.description: string | null` (Task 2) usado por el panel y el board. `onOpen: (id: string) => void` coincide entre `Column`/`Draggable` (Task 4) y `setSelectedId` de `Board`. `resolveMove`/`COLUMNS` intactos. `data-testid="task-detail-panel"` consistente entre panel (Task 3) y los tests (Tasks 3–4). ✅
