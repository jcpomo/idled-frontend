# Subtareas (tareas anidadas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any task own subtasks (tasks with a `parent_id`), managed inside the `TaskDetailPanel`: a Subtareas section lists children with status + progress, creates them, and clicking a subtask navigates the panel to it with breadcrumbs back to the parent.

**Architecture:** Subtasks reuse the `Task` model via a nullable self-referential `parent_id`. The Kanban board lists only top-level tasks (`parent_id IS NULL`); subtasks live only inside the panel. The panel is refactored from receiving a `task` object to receiving a `taskId` and maintaining an internal navigation stack: each view fetches its task via `useTask(id)` (`GET /api/tasks/{id}`) and its children via `useSubtasks(id)`. A subtask's status changes via `PATCH` (subtasks aren't on the board); a top-level task's status still changes via `move` (to renumber its column).

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, @dnd-kit/core, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Tasks 1–2 are in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 3–4 are in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **Ownership security, no new RBAC:** access to another user's task/subtask returns None/404, never 403. Subtask ownership resolves through the parent's project (existing `get_owned_task` JOIN).
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>` from the backend repo. Tests build tables via `Base.metadata.create_all` (NOT migrations), so a model field/FK is visible to tests without the migration; the Alembic migration is for the real DB.
- **Frontend tests run on the HOST:** `npx vitest run <path>` from the frontend repo. vitest is scoped to `tests/**/*.test.{ts,tsx}`.
- **Board lists only top-level:** `list_tasks` filters `parent_id IS NULL`.
- **Subtask status → PATCH; top-level status → move.** Rule keyed on `parent_id`.
- **Panel receives `{ taskId, projectId, onClose }`** and owns a navigation stack; each view uses `useTask(currentId)`/`useSubtasks(currentId)`. Field state seeds from the task and remounts per task (`key`).
- **Cache coordination:** `useUpdateTask`/`useDeleteTask`/`useMoveTask` mutate-variables gain an optional `parentId?: string`; onSuccess they invalidate `['tasks', projectId]` + `['task', v.taskId]`, and if `v.parentId` is present, also `['subtasks', v.parentId]`.
- **Dark tokens** from globals.css. Existing sibling components use `#888`/`#bbb` for muted text (no `--text-muted` token exists yet); matching that is acceptable here (a token sweep is a tracked fast-follow). TDD, YAGNI, pristine output.

---

## File Structure

**Backend (`idled-backend`):**
- `app/gestor/models.py` — `Task` gains `parent_id` (self-ref FK, nullable, indexed).
- `migrations/versions/f4a2b6c8d0e1_task_parent_id.py` — NEW migration (down_revision `e3f1a2b4c5d6`).
- `app/gestor/service.py` — `list_tasks` filters top-level; new `list_subtasks`, `create_subtask`; `update_task` gains `status`.
- `app/api/tasks.py` — `_task_dict` + `parent_id`; `TaskUpdateBody` + `status`; new `GET /{id}`, `GET /{id}/subtasks`, `POST /{id}/subtasks`.
- `app/api/projects.py` — `_task_dict` + `parent_id`.
- Tests: `tests/test_gestor_subtasks.py` (new), `tests/test_gestor_tasks_service.py`, `tests/test_tasks_endpoint.py`, `tests/test_projects_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/types.ts` — `Task` gains `parent_id`.
- `lib/api.ts` — `getTask`, `listSubtasks`, `createSubtask`; `updateTask` patch + `status`.
- `lib/queries.ts` — `useTask`, `useSubtasks`, `useCreateSubtask`; `parentId` invalidation on update/delete/move.
- `components/kanban/TaskDetailPanel.tsx` — full refactor: `taskId` + nav stack + breadcrumbs + inner `TaskFields` + Subtareas section + status rule.
- `components/kanban/Board.tsx` — pass `taskId` instead of `task`.
- Tests: `tests/subtask-queries.test.tsx` (new), `tests/task-detail-panel.test.tsx` (rewrite), `tests/kanban-open.test.tsx` (update mocks), `tests/task-mutations.test.tsx` (update `useDeleteTask` signature).

---

### Task 1: Backend `parent_id` model, migration, and subtask services

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/models.py`, `app/gestor/service.py`
- Create: `migrations/versions/f4a2b6c8d0e1_task_parent_id.py`, `tests/test_gestor_subtasks.py`
- Test: `tests/test_gestor_tasks_service.py`

**Interfaces:**
- Consumes: existing `get_owned_task`, `create_project`, `create_task`, `list_tasks`, `is_valid_status`, and the conftest `session` fixture.
- Produces:
  - `Task.parent_id: uuid.UUID | None`.
  - `list_tasks(...)` now returns only top-level tasks (`parent_id IS NULL`).
  - `list_subtasks(session, parent_id, user_external_id) -> list[Task] | None` (None if parent not owned).
  - `create_subtask(session, parent_id, user_external_id, *, title, status="open") -> Task | None` (None if parent not owned; raises ValueError on invalid status).
  - `update_task(..., status: str | None = None)` (applies status if given; raises ValueError if invalid).

- [ ] **Step 1: Write the failing service tests** — `tests/test_gestor_subtasks.py`

```python
import pytest
from app.gestor.service import (
    create_project, create_task, list_tasks, create_subtask, list_subtasks, update_task,
)

@pytest.mark.asyncio
async def test_create_subtask_sets_parent_and_project(session):
    p = await create_project(session, "ext-1", "P")
    parent = await create_task(session, p.id, "ext-1", title="Padre")
    sub = await create_subtask(session, parent.id, "ext-1", title="Hija")
    assert sub is not None
    assert sub.parent_id == parent.id
    assert sub.project_id == parent.project_id
    assert sub.position == 0

@pytest.mark.asyncio
async def test_create_subtask_other_user_blocked(session):
    p = await create_project(session, "ext-1", "P")
    parent = await create_task(session, p.id, "ext-1", title="Padre")
    assert await create_subtask(session, parent.id, "ext-2", title="Hack") is None

@pytest.mark.asyncio
async def test_list_tasks_excludes_subtasks(session):
    p = await create_project(session, "ext-1", "P")
    parent = await create_task(session, p.id, "ext-1", title="Padre")
    await create_subtask(session, parent.id, "ext-1", title="Hija")
    top = await list_tasks(session, p.id, "ext-1")
    assert [t.title for t in top] == ["Padre"]  # subtask excluded

@pytest.mark.asyncio
async def test_list_subtasks_returns_children_ordered(session):
    p = await create_project(session, "ext-1", "P")
    parent = await create_task(session, p.id, "ext-1", title="Padre")
    await create_subtask(session, parent.id, "ext-1", title="a")
    await create_subtask(session, parent.id, "ext-1", title="b")
    subs = await list_subtasks(session, parent.id, "ext-1")
    assert [s.title for s in subs] == ["a", "b"]
    assert await list_subtasks(session, parent.id, "ext-2") is None  # not owner

@pytest.mark.asyncio
async def test_update_task_accepts_status(session):
    p = await create_project(session, "ext-1", "P")
    parent = await create_task(session, p.id, "ext-1", title="Padre")
    sub = await create_subtask(session, parent.id, "ext-1", title="Hija")
    upd = await update_task(session, sub.id, "ext-1", status="done")
    assert upd.status == "done"
    with pytest.raises(ValueError):
        await update_task(session, sub.id, "ext-1", status="nope")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_gestor_subtasks.py -v`
Expected: FAIL — `create_subtask`/`list_subtasks` not importable; `update_task` has no `status`.

- [ ] **Step 3: Add `parent_id` to the model** — `app/gestor/models.py`

Add `ForeignKey` to the sqlalchemy import and the column after `project_id`:

```python
from sqlalchemy import String, Integer, DateTime, Uuid, func, Text, ForeignKey
```
```python
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
```

- [ ] **Step 4: Filter `list_tasks`, add subtask services, extend `update_task`** — `app/gestor/service.py`

In `list_tasks`, add the top-level filter:

```python
    result = await session.execute(
        select(Task).where(Task.project_id == project_id, Task.parent_id.is_(None))
        .order_by(Task.status, Task.position)
    )
```

Extend `update_task` — add the `status` keyword and apply-with-validation at the top of the body (after the None check):

```python
async def update_task(
    session: AsyncSession, task_id: uuid.UUID, user_external_id: str, *,
    title: str | None = None, task_type: str | None = None,
    assignee: str | None = None, due_date: str | None = None,
    description: str | None = None, status: str | None = None,
) -> Task | None:
    task = await get_owned_task(session, task_id, user_external_id)
    if task is None:
        return None
    if status is not None:
        if not is_valid_status(status):
            raise ValueError(f"Estado inválido: {status}")
        task.status = status
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

Add the two subtask services (place them after `create_task`):

```python
async def create_subtask(
    session: AsyncSession, parent_id: uuid.UUID, user_external_id: str, *,
    title: str, status: str = "open",
) -> Task | None:
    if not is_valid_status(status):
        raise ValueError(f"Estado inválido: {status}")
    parent = await get_owned_task(session, parent_id, user_external_id)
    if parent is None:
        return None
    result = await session.execute(
        select(safunc.max(Task.position)).where(Task.parent_id == parent_id)
    )
    max_pos = result.scalar()
    position = 0 if max_pos is None else max_pos + 1
    sub = Task(
        project_id=parent.project_id, parent_id=parent_id, title=title,
        status=status, position=position,
    )
    session.add(sub)
    await session.commit()
    await session.refresh(sub)
    return sub

async def list_subtasks(
    session: AsyncSession, parent_id: uuid.UUID, user_external_id: str
) -> list[Task] | None:
    parent = await get_owned_task(session, parent_id, user_external_id)
    if parent is None:
        return None
    result = await session.execute(
        select(Task).where(Task.parent_id == parent_id).order_by(Task.position)
    )
    return list(result.scalars().all())
```

- [ ] **Step 5: Run the subtask service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_gestor_subtasks.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Guard against a regression in the existing top-level tests**

Run: `docker compose run --rm api pytest tests/test_gestor_tasks_service.py -v`
Expected: PASS — the `parent_id IS NULL` filter must not break the existing list tests (all their tasks are top-level). If any fail, the filter or a fixture is wrong — fix before continuing.

- [ ] **Step 7: Create the Alembic migration** — `migrations/versions/f4a2b6c8d0e1_task_parent_id.py`

```python
"""task parent_id

Revision ID: f4a2b6c8d0e1
Revises: e3f1a2b4c5d6
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a2b6c8d0e1'
down_revision: Union[str, Sequence[str], None] = 'e3f1a2b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tasks', sa.Column('parent_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_tasks_parent_id'), 'tasks', ['parent_id'], unique=False)
    op.create_foreign_key(
        'fk_tasks_parent_id_tasks', 'tasks', 'tasks',
        ['parent_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_tasks_parent_id_tasks', 'tasks', type_='foreignkey')
    op.drop_index(op.f('ix_tasks_parent_id'), table_name='tasks')
    op.drop_column('tasks', 'parent_id')
```

Verify it applies (or at least is the new head):

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `e3f1a2b4c5d6 -> f4a2b6c8d0e1` with no error. If no DB is reachable, run `docker compose run --rm api alembic history` and confirm `f4a2b6c8d0e1` is the head after `e3f1a2b4c5d6`; note which you verified in the report.

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add -A
git commit -m "feat: task parent_id, subtask services, and status update"
```

---

### Task 2: Backend subtask API endpoints

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/api/tasks.py`, `app/api/projects.py`
- Test: `tests/test_tasks_endpoint.py`, `tests/test_projects_endpoint.py`

**Interfaces:**
- Consumes: `get_owned_task`, `list_subtasks`, `create_subtask`, `update_task` (with `status`), `is_valid_status`.
- Produces:
  - Every task JSON includes `"parent_id"` (string or null).
  - `PATCH /api/tasks/{id}` accepts `status` (invalid → 422).
  - `GET /api/tasks/{id}` → owned task dict (404 if not owned).
  - `GET /api/tasks/{id}/subtasks` → `[task dict]` (404 if parent not owned).
  - `POST /api/tasks/{id}/subtasks` body `{title, status?}` → created subtask dict (404 if parent not owned, 422 invalid status).

- [ ] **Step 1: Write the failing endpoint tests** — append to `tests/test_tasks_endpoint.py`

(This file already defines `client`, `_token`, `_make_task` — reuse them.)

```python
@pytest.mark.asyncio
async def test_task_dict_includes_parent_id(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        r = await ac.get(f"/api/tasks/{tid}", headers=h)
        assert r.status_code == 200 and r.json()["parent_id"] is None

@pytest.mark.asyncio
async def test_get_task_other_user_404(client):
    async with client as ac:
        tid = await _make_task(ac, {"Authorization": f"Bearer {_token(sub='owner')}"})
        r = await ac.get(f"/api/tasks/{tid}", headers={"Authorization": f"Bearer {_token(sub='intruder')}"})
        assert r.status_code == 404

@pytest.mark.asyncio
async def test_create_and_list_subtasks(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        rc = await ac.post(f"/api/tasks/{tid}/subtasks", json={"title": "Hija"}, headers=h)
        assert rc.status_code == 200
        assert rc.json()["parent_id"] == tid and rc.json()["title"] == "Hija"
        rl = await ac.get(f"/api/tasks/{tid}/subtasks", headers=h)
        assert rl.status_code == 200 and [s["title"] for s in rl.json()] == ["Hija"]

@pytest.mark.asyncio
async def test_patch_status(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        r = await ac.patch(f"/api/tasks/{tid}", json={"status": "done"}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "done"
        rbad = await ac.patch(f"/api/tasks/{tid}", json={"status": "nope"}, headers=h)
        assert rbad.status_code == 422

@pytest.mark.asyncio
async def test_create_subtask_other_user_404(client):
    async with client as ac:
        tid = await _make_task(ac, {"Authorization": f"Bearer {_token(sub='owner')}"})
        r = await ac.post(f"/api/tasks/{tid}/subtasks", json={"title": "x"},
                          headers={"Authorization": f"Bearer {_token(sub='intruder')}"})
        assert r.status_code == 404
```

- [ ] **Step 2: Write the failing projects-endpoint test** — append to `tests/test_projects_endpoint.py`

(Reuse this file's existing `client`/`_token` helpers.)

```python
@pytest.mark.asyncio
async def test_board_list_excludes_subtasks_and_has_parent_id(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        tid = (await ac.post(f"/api/projects/{pid}/tasks", json={"title": "Padre"}, headers=h)).json()["id"]
        await ac.post(f"/api/tasks/{tid}/subtasks", json={"title": "Hija"}, headers=h)
        tasks = (await ac.get(f"/api/projects/{pid}/tasks", headers=h)).json()
        assert [t["title"] for t in tasks] == ["Padre"]      # subtask not on the board
        assert tasks[0]["parent_id"] is None
```

- [ ] **Step 3: Run the endpoint tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_tasks_endpoint.py tests/test_projects_endpoint.py -k "parent_id or subtask or patch_status or excludes" -v`
Expected: FAIL — endpoints missing / `parent_id` key absent.

- [ ] **Step 4: Extend `app/api/tasks.py`**

Update the import, body model, serializer, and add the three endpoints:

```python
from app.gestor.service import (
    update_task, delete_task, move_task, get_owned_task, list_subtasks, create_subtask,
)
```
```python
class TaskUpdateBody(BaseModel):
    title: str | None = None
    task_type: str | None = None
    assignee: str | None = None
    due_date: str | None = None
    description: str | None = None
    status: str | None = None

class SubtaskBody(BaseModel):
    title: str
    status: str = "open"
```
```python
def _task_dict(t) -> dict:
    return {"id": str(t.id), "title": t.title, "task_type": t.task_type,
            "status": t.status, "assignee": t.assignee, "due_date": t.due_date,
            "position": t.position, "description": t.description,
            "parent_id": str(t.parent_id) if t.parent_id else None}
```

In the PATCH handler, validate status and pass it:

```python
@router.patch("/{task_id}")
async def actualizar(task_id: uuid.UUID, body: TaskUpdateBody,
                     user: User = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> dict:
    if body.status is not None and not is_valid_status(body.status):
        raise HTTPException(status_code=422, detail=f"Estado inválido: {body.status}")
    t = await update_task(session, task_id, user.external_id, title=body.title,
                          task_type=body.task_type, assignee=body.assignee,
                          due_date=body.due_date, description=body.description, status=body.status)
    if t is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return _task_dict(t)
```

Add the three new endpoints (after the `move` handler):

```python
@router.get("/{task_id}")
async def obtener(task_id: uuid.UUID, user: User = Depends(get_current_user),
                  session: AsyncSession = Depends(get_session)) -> dict:
    t = await get_owned_task(session, task_id, user.external_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return _task_dict(t)

@router.get("/{task_id}/subtasks")
async def listar_subtareas(task_id: uuid.UUID, user: User = Depends(get_current_user),
                           session: AsyncSession = Depends(get_session)) -> list[dict]:
    subs = await list_subtasks(session, task_id, user.external_id)
    if subs is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return [_task_dict(s) for s in subs]

@router.post("/{task_id}/subtasks")
async def crear_subtarea(task_id: uuid.UUID, body: SubtaskBody,
                         user: User = Depends(get_current_user),
                         session: AsyncSession = Depends(get_session)) -> dict:
    if not is_valid_status(body.status):
        raise HTTPException(status_code=422, detail=f"Estado inválido: {body.status}")
    s = await create_subtask(session, task_id, user.external_id, title=body.title, status=body.status)
    if s is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return _task_dict(s)
```

> IMPORTANT (route ordering): `GET /{task_id}` and `GET /{task_id}/subtasks` are distinct paths, so FastAPI matches them unambiguously — no ordering trap. Keep them as written.

- [ ] **Step 5: Add `parent_id` to `app/api/projects.py` serializer**

```python
def _task_dict(t) -> dict:
    return {"id": str(t.id), "title": t.title, "task_type": t.task_type,
            "status": t.status, "assignee": t.assignee, "due_date": t.due_date,
            "position": t.position, "description": t.description,
            "parent_id": str(t.parent_id) if t.parent_id else None}
```

- [ ] **Step 6: Run the endpoint tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_tasks_endpoint.py tests/test_projects_endpoint.py -v`
Expected: PASS (existing + new).

- [ ] **Step 7: Run the full backend suite**

Run: `docker compose run --rm api pytest -q`
Expected: all pass (the 4 pre-existing live/e2e `ConnectError` tests may fail if no live stack/OpenAI — that is unrelated; everything else green).

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add -A
git commit -m "feat: subtask endpoints (get task, list/create subtasks) and status patch"
```

---

### Task 3: Frontend data layer — subtask types, api, hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`, `tests/task-mutations.test.tsx`
- Test: `tests/subtask-queries.test.tsx` (create)

**Interfaces:**
- Produces:
  - `Task.parent_id: string | null`.
  - `getTask(token, id)`, `listSubtasks(token, id)`, `createSubtask(token, parentId, input: { title: string; status?: TaskStatus })`.
  - `updateTask` patch type gains `status?: TaskStatus`.
  - `useTask(id)` → `['task', id]`; `useSubtasks(id)` → `['subtasks', id]`; `useCreateSubtask(parentId)` → invalidates `['subtasks', parentId]`.
  - `useUpdateTask`/`useDeleteTask`/`useMoveTask` mutate-variables gain optional `parentId?: string` and extra invalidation (`['task', taskId]`, and `['subtasks', parentId]` when present). `useDeleteTask` mutate becomes `(v: { taskId: string; parentId?: string })`.

- [ ] **Step 1: Write the failing test** — `tests/subtask-queries.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useTask, useSubtasks, useCreateSubtask } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useTask fetches a single task via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'getTask').mockResolvedValue({ id: 't1' } as never)
  const { result } = renderHook(() => useTask('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useSubtasks fetches children via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listSubtasks').mockResolvedValue([] as never)
  const { result } = renderHook(() => useSubtasks('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useCreateSubtask posts a subtask via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'createSubtask').mockResolvedValue({} as never)
  const { result } = renderHook(() => useCreateSubtask('t1'), { wrapper: wrapper() })
  result.current.mutate({ title: 'Hija' })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', { title: 'Hija' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/subtask-queries.test.tsx`
Expected: FAIL — `useTask`/`useSubtasks`/`useCreateSubtask`/`api.getTask`/... not exported.

- [ ] **Step 3: Add `parent_id` to the Task type** — `lib/types.ts`

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
  parent_id: string | null
}
```

- [ ] **Step 4: Add the api functions** — `lib/api.ts`

Extend the `updateTask` patch type with `status`, and append the three functions:

```ts
export const updateTask = (
  token: string,
  taskId: string,
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string; status?: TaskStatus },
) => apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch, token })

export const getTask = (token: string, taskId: string) =>
  apiFetch<Task>(`/api/tasks/${taskId}`, { token })

export const listSubtasks = (token: string, taskId: string) =>
  apiFetch<Task[]>(`/api/tasks/${taskId}/subtasks`, { token })

export const createSubtask = (
  token: string,
  parentId: string,
  input: { title: string; status?: TaskStatus },
) => apiFetch<Task>(`/api/tasks/${parentId}/subtasks`, { method: 'POST', body: input, token })
```

- [ ] **Step 5: Add/extend the hooks** — `lib/queries.ts`

Replace `useMoveTask`, `useUpdateTask`, `useDeleteTask` with the `parentId`-aware versions and append the three new hooks. Full replacement block for the three existing ones:

```ts
export function useMoveTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { taskId: string; status: TaskStatus; position: number; parentId?: string }) =>
      api.moveTask(token(), v.taskId, v.status, v.position),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      taskId: string
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string; status?: TaskStatus }
      parentId?: string
    }) => api.updateTask(token(), v.taskId, v.patch),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { taskId: string; parentId?: string }) => api.deleteTask(token(), v.taskId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}
```

Append the three new hooks:

```ts
export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => api.listSubtasks(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useCreateSubtask(parentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; status?: TaskStatus }) =>
      api.createSubtask(token(), parentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subtasks', parentId] }),
  })
}
```

- [ ] **Step 6: Update the `useDeleteTask` test for its new signature** — `tests/task-mutations.test.tsx`

The delete test currently calls `result.current.mutate('t1')`. Change that one call to the object form:

```tsx
  result.current.mutate({ taskId: 't1' })
```
(The assertion `expect(spy).toHaveBeenCalledWith('tok', 't1')` stays — `deleteTask(token, taskId)` is unchanged.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/subtask-queries.test.tsx tests/task-mutations.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: subtask api + hooks, parentId cache invalidation, task status patch"
```

---

### Task 4: Panel navigation + Subtareas section

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Rewrite: `components/kanban/TaskDetailPanel.tsx`
- Modify: `components/kanban/Board.tsx`, `tests/kanban-open.test.tsx`
- Test: `tests/task-detail-panel.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `useTask`, `useSubtasks`, `useCreateSubtask`, `useUpdateTask`, `useMoveTask`, `useDeleteTask`, `useTasks`.
- Produces: `TaskDetailPanel({ taskId, projectId, onClose })` (default export, root `data-testid="task-detail-panel"`). Board renders it with `taskId={selectedId}` and `key={selectedId}`.

- [ ] **Step 1: Rewrite the panel test** — `tests/task-detail-panel.test.tsx` (replace the whole file)

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const parent: Task = {
  id: 't1', title: 'Padre', task_type: 'PPTO', status: 'open',
  assignee: 'ED', due_date: null, position: 0, description: 'desc', parent_id: null,
}
const child: Task = {
  id: 's1', title: 'Hija', task_type: 'PPTO', status: 'open',
  assignee: null, due_date: null, position: 0, description: null, parent_id: 't1',
}

function stub(opts: { current?: Task; subtasks?: Task[]; byId?: Record<string, Task> } = {}) {
  const update = vi.fn(); const move = vi.fn(); const del = vi.fn(); const createSub = vi.fn()
  const byId = opts.byId
  vi.spyOn(queries, 'useTask').mockImplementation(((id: string) =>
    ({ data: byId ? byId[id] : (opts.current ?? parent) })) as never)
  vi.spyOn(queries, 'useSubtasks').mockReturnValue({ data: opts.subtasks ?? [] } as never)
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: [parent] } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: move } as never)
  vi.spyOn(queries, 'useDeleteTask').mockReturnValue({ mutate: del } as never)
  vi.spyOn(queries, 'useCreateSubtask').mockReturnValue({ mutate: createSub } as never)
  return { update, move, del, createSub }
}

it('renders the current task fields from useTask(taskId)', async () => {
  stub({ current: parent })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('task-detail-panel')).toBeInTheDocument()
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Padre')
})

it('top-level status change uses move', async () => {
  const { move } = stub({ current: parent })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  expect(move).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't1', status: 'done' }))
})

it('subtask status change uses update (PATCH) with parentId', async () => {
  const { update, move } = stub({ current: child })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="s1" projectId="p1" onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('estado'), { target: { value: 'done' } })
  expect(move).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledWith({ taskId: 's1', patch: { status: 'done' }, parentId: 't1' })
})

it('lists subtasks with progress and creates one', async () => {
  const done: Task = { ...child, id: 's2', title: 'Hecha', status: 'done' }
  const { createSub } = stub({ current: parent, subtasks: [child, done] })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  expect(screen.getByTestId('subtask-progress').textContent).toBe('1/2')
  expect(screen.getAllByTestId('subtask-item')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('nueva subtarea'), { target: { value: 'Nueva' } })
  fireEvent.click(screen.getByRole('button', { name: 'crear subtarea' }))
  expect(createSub).toHaveBeenCalledWith({ title: 'Nueva' })
})

it('clicking a subtask navigates into it, breadcrumb returns to parent', async () => {
  stub({ byId: { t1: parent, s1: child }, subtasks: [child] })
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  // open the subtask
  fireEvent.click(screen.getByTestId('subtask-item'))
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Hija')
  // breadcrumb back to the parent
  fireEvent.click(screen.getByRole('button', { name: 'volver a Padre' }))
  expect((screen.getByLabelText('título') as HTMLInputElement).value).toBe('Padre')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-detail-panel.test.tsx`
Expected: FAIL — panel still takes a `task` prop / no subtask section / no breadcrumb.

- [ ] **Step 3: Rewrite `components/kanban/TaskDetailPanel.tsx`** (replace the whole file)

```tsx
'use client'
import { useEffect, useState } from 'react'
import {
  useTask, useSubtasks, useCreateSubtask, useUpdateTask, useMoveTask, useDeleteTask, useTasks,
} from '@/lib/queries'
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

// Editable fields for one task, seeded from the task and remounted per task via `key`.
function TaskFields({
  task, projectId, onDeleted,
}: { task: Task; projectId: string; onDeleted: () => void }) {
  const update = useUpdateTask(projectId)
  const move = useMoveTask(projectId)
  const del = useDeleteTask(projectId)
  const { data: topTasks } = useTasks(projectId)
  const parentId = task.parent_id ?? undefined

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [taskType, setTaskType] = useState(task.task_type)
  const [assignee, setAssignee] = useState(task.assignee ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [confirming, setConfirming] = useState(false)

  function patchIfChanged(field: string, value: string, current: string) {
    if (value !== current) update.mutate({ taskId: task.id, patch: { [field]: value }, parentId })
  }

  function onStatusChange(next: TaskStatus) {
    if (task.parent_id) {
      update.mutate({ taskId: task.id, patch: { status: next }, parentId })
    } else {
      const position = (topTasks ?? []).filter((t) => t.status === next).length
      move.mutate({ taskId: task.id, status: next, position })
    }
  }

  function onDelete() {
    del.mutate({ taskId: task.id, parentId })
    onDeleted()
  }

  return (
    <>
      <label htmlFor="td-title" style={labelStyle}>Título</label>
      <input id="td-title" aria-label="título" value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => patchIfChanged('title', title, task.title)} style={fieldStyle} />

      <label htmlFor="td-desc" style={labelStyle}>Descripción</label>
      <textarea id="td-desc" aria-label="descripción" value={description} rows={4}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => patchIfChanged('description', description, task.description ?? '')}
        style={{ ...fieldStyle, resize: 'vertical' }} />

      <label htmlFor="td-type" style={labelStyle}>Tipo</label>
      <input id="td-type" aria-label="tipo" value={taskType}
        onChange={(e) => setTaskType(e.target.value)}
        onBlur={() => patchIfChanged('task_type', taskType, task.task_type)} style={fieldStyle} />

      <label htmlFor="td-assignee" style={labelStyle}>Asignado</label>
      <input id="td-assignee" aria-label="asignado" value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        onBlur={() => patchIfChanged('assignee', assignee, task.assignee ?? '')} style={fieldStyle} />

      <label htmlFor="td-due" style={labelStyle}>Fecha</label>
      <input id="td-due" aria-label="fecha" type="date" value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onBlur={() => patchIfChanged('due_date', dueDate, task.due_date ?? '')} style={fieldStyle} />

      <label htmlFor="td-status" style={labelStyle}>Estado</label>
      <select id="td-status" aria-label="estado" value={task.status}
        onChange={(e) => onStatusChange(e.target.value as TaskStatus)} style={fieldStyle}>
        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <div style={{ paddingTop: 8 }}>
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
    </>
  )
}

export default function TaskDetailPanel({
  taskId, projectId, onClose,
}: { taskId: string; projectId: string; onClose: () => void }) {
  const [stack, setStack] = useState<{ id: string; title: string | null }[]>([{ id: taskId, title: null }])
  const currentId = stack[stack.length - 1].id
  const { data: current } = useTask(currentId)
  const { data: subtasks } = useSubtasks(currentId)
  const createSub = useCreateSubtask(currentId)
  const [newSub, setNewSub] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the current stack entry's title in sync once the task loads (for breadcrumbs).
  useEffect(() => {
    if (!current) return
    setStack((s) => {
      const top = s[s.length - 1]
      if (top.title === current.title) return s
      const copy = s.slice()
      copy[copy.length - 1] = { id: top.id, title: current.title }
      return copy
    })
  }, [current])

  function openSubtask(sub: Task) { setStack((s) => [...s, { id: sub.id, title: sub.title }]) }
  function popTo(index: number) { setStack((s) => s.slice(0, index + 1)) }
  function onDeleted() { if (stack.length > 1) popTo(stack.length - 2); else onClose() }

  const total = (subtasks ?? []).length
  const done = (subtasks ?? []).filter((t) => t.status === 'done').length

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
      <aside data-testid="task-detail-panel"
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
          background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', fontSize: 12 }}>
            {stack.map((entry, i) => (
              <span key={entry.id}>
                {i > 0 && <span style={{ color: '#666' }}> › </span>}
                {i < stack.length - 1 ? (
                  <button aria-label={`volver a ${entry.title ?? ''}`} onClick={() => popTo(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    {entry.title ?? '…'}
                  </button>
                ) : (
                  <span style={{ color: 'var(--text)' }}>{current?.title ?? '…'}</span>
                )}
              </span>
            ))}
          </div>
          <button aria-label="cerrar" onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        {current ? (
          <TaskFields key={current.id} task={current} projectId={projectId} onDeleted={onDeleted} />
        ) : (
          <p style={{ color: 'var(--text)' }}>Cargando…</p>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={labelStyle}>Subtareas</span>
            <span data-testid="subtask-progress" style={{ fontSize: 11, color: '#888' }}>{done}/{total}</span>
          </div>
          {(subtasks ?? []).map((s) => (
            <button key={s.id} data-testid="subtask-item" onClick={() => openSubtask(s)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                padding: 8, marginBottom: 6, background: 'var(--bg-3)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
              }}>
              <span>{s.title}</span>
              <span className="mono" style={{ fontSize: 10, color: '#888' }}>{s.status}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input aria-label="nueva subtarea" value={newSub} onChange={(e) => setNewSub(e.target.value)}
              placeholder="+ subtarea"
              style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
            <button aria-label="crear subtarea"
              onClick={() => { if (newSub.trim()) { createSub.mutate({ title: newSub.trim() }); setNewSub('') } }}
              style={{ padding: '6px 8px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>+</button>
          </div>
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 4: Point `Board` at the new panel interface** — `components/kanban/Board.tsx`

Remove the `selectedTask` line and render the panel with `taskId`:

Delete this line:
```tsx
  const selectedTask = (tasks ?? []).find((t) => t.id === selectedId) ?? null
```
Replace the panel render block:
```tsx
      {selectedId && (
        <TaskDetailPanel key={selectedId} taskId={selectedId} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
```

- [ ] **Step 5: Update the board-open test mocks** — `tests/kanban-open.test.tsx`

The panel now calls `useTask`/`useSubtasks`/`useCreateSubtask`; the `stub()` in this file must provide them so the panel renders. Add these three lines inside its `stub()` function (alongside the existing spies):

```tsx
  vi.spyOn(queries, 'useTask').mockReturnValue({ data: tasks[0] } as never)
  vi.spyOn(queries, 'useSubtasks').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useCreateSubtask').mockReturnValue({ mutate: vi.fn() } as never)
```
(The existing assertion — click a card, expect `task-detail-panel` — stays. `tasks[0]` in that file has no `parent_id`; add `parent_id: null` to its literal so it satisfies the `Task` type.)

- [ ] **Step 6: Run the panel + board-open tests, then the full suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/task-detail-panel.test.tsx tests/kanban-open.test.tsx
npx vitest run
npm run build
```
Expected: the two targeted files pass; full suite passes; build compiles. If `tests/board.test.tsx` or others reference a `Task` literal missing `parent_id`, add `parent_id: null` to those literals (type-only fix, no behavior change).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: task panel navigation stack, breadcrumbs, and subtasks section"
```

---

## Out of scope (this plan)

- Progreso hecho/total en la **tarjeta del board** (requiere contar hijas en el listado del board).
- Drag-reorder de subtareas; mover subtarea entre padres; UI multi-nivel simultánea (más allá de navegar con migas); plantillas de subtareas por tipo.
- Backlog fast-follow heredado (click parásito tras drag, `--text-muted`, `due_date=""`→null, `useCallback` en Esc) — sigue pendiente, no se aborda aquí.

## Self-Review

**Spec coverage:**
- `Task.parent_id` + migración → Task 1. ✅
- Board lista solo top-level (`list_tasks` filtra) → Task 1 (servicio) + Task 2 (endpoint test lo verifica). ✅
- `list_subtasks`/`create_subtask` + `update_task` acepta `status` → Task 1. ✅
- `GET /api/tasks/{id}`, `GET/POST /api/tasks/{id}/subtasks`, PATCH acepta status, `parent_id` en toda serialización → Task 2. ✅
- Tipos + `getTask`/`listSubtasks`/`createSubtask` + `useTask`/`useSubtasks`/`useCreateSubtask` + invalidación `parentId` → Task 3. ✅
- Panel por `taskId` + pila + migas + sección Subtareas + progreso + regla estado (subtarea PATCH / top-level move) + Board pasa `taskId` → Task 4. ✅
- Aislamiento por usuario (404) → Tasks 1–2 tests. ✅

**Placeholder scan:** sin TBD/TODO; todo el código está completo (modelo, migración `f4a2b6c8d0e1`←`e3f1a2b4c5d6`, servicios, endpoints, tipos, api, hooks, panel completo, Board). ✅

**Type consistency:** `useUpdateTask` var `{taskId,patch,parentId?}`, `useDeleteTask` var `{taskId,parentId?}`, `useMoveTask` var `{taskId,status,position,parentId?}` — coinciden entre Task 3 (definición) y su uso en `TaskFields` (Task 4). `useDeleteTask` cambia de `mutate(string)` a `mutate({taskId})` → actualizado en su test (Task 3, paso 6) y en `TaskFields`. `createSubtask(token,parentId,{title,status?})` coincide entre api (Task 3) y `useCreateSubtask`/panel. `Task.parent_id: string|null` (Task 3) usado por el panel y los tests. `data-testid` `task-detail-panel`/`subtask-item`/`subtask-progress` y aria-labels `título`/`estado`/`nueva subtarea`/`crear subtarea`/`volver a <título>` consistentes entre panel (Task 4) y sus tests. `Board` pasa `taskId`+`key={selectedId}` (Task 4) al panel cuyo prop es `taskId` (Task 4). ✅
