# Comentarios por tarea — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A comment thread per task, managed inside the `TaskDetailPanel`: list, add, edit, and delete your own comments, with the author and edit-state shown.

**Architecture:** A new `TaskComment` model (self-contained table, FK to `tasks` with CASCADE). Comment services are author-scoped for edit/delete and task-owner-scoped for list/create. The backend serializes a `mine` flag per comment (author == current user) so the frontend shows edit/delete controls without decoding the JWT. The panel gains a `CommentsSection` subcomponent driven by the current task id.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Tasks 1–2 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 3–4 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **Ownership:** list/create require the task to be owned by the user (`get_owned_task`), else 404. **Edit/delete are author-scoped**: only when `comment.author_external_id == user.external_id`, else 404 (never 403).
- **`mine` computed server-side** in `comment_dict` (`author_external_id == current user`).
- **`author_name` denormalized** (snapshot of `user.name` at creation, nullable).
- **Comments ordered by `created_at` ascending.** Deleting a task deletes its comments (FK CASCADE).
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>`. Tables build via `Base.metadata.create_all` (conftest already imports `app.gestor.models`, so `TaskComment` registers automatically) — the migration is for the real DB.
- **Frontend tests run on the HOST:** `npx vitest run <path>`. vitest scoped to `tests/**/*.test.{ts,tsx}`.
- Dark tokens (sibling components use `#888`/`#bbb` for muted text — acceptable). TDD, YAGNI, pristine output.

---

## File Structure

**Backend (`idled-backend`):**
- `app/gestor/models.py` — new `TaskComment`.
- `migrations/versions/a7b9c1d3e5f7_task_comments.py` — NEW migration (down_revision `f4a2b6c8d0e1`).
- `app/gestor/comments_service.py` — NEW: create/list/update/delete + `comment_dict`.
- `app/api/tasks.py` — `GET`/`POST /api/tasks/{id}/comments`.
- `app/api/comments.py` — NEW router: `PATCH`/`DELETE /api/comments/{id}`.
- `app/main.py` — register the comments router.
- Tests: `tests/test_comments_service.py` (new), `tests/test_tasks_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/types.ts` — `TaskComment`.
- `lib/api.ts` — `listComments`, `createComment`, `updateComment`, `deleteComment`.
- `lib/queries.ts` — `useComments`, `useCreateComment`, `useUpdateComment`, `useDeleteComment`.
- `components/kanban/CommentsSection.tsx` — NEW, mounted in `TaskDetailPanel.tsx`.
- `components/kanban/TaskDetailPanel.tsx` — mount `<CommentsSection taskId={current.id} />`.
- Tests: `tests/comment-queries.test.tsx` (new), `tests/comments-section.test.tsx` (new), `tests/task-detail-panel.test.tsx` + `tests/kanban-open.test.tsx` (update mocks).

---

### Task 1: Backend `TaskComment` model, migration, and comment services

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/models.py`
- Create: `migrations/versions/a7b9c1d3e5f7_task_comments.py`, `app/gestor/comments_service.py`, `tests/test_comments_service.py`

**Interfaces:**
- Consumes: `get_owned_task`, `create_project`, `create_task`, the conftest `session` fixture.
- Produces:
  - `TaskComment` model.
  - `create_comment(session, task_id, user_external_id, author_name, content) -> TaskComment | None` (None if task not owned).
  - `list_comments(session, task_id, user_external_id) -> list[TaskComment] | None` (None if task not owned; ordered by `created_at`).
  - `update_comment(session, comment_id, user_external_id, content) -> TaskComment | None` (None unless author; sets `edited_at`).
  - `delete_comment(session, comment_id, user_external_id) -> bool` (False unless author).
  - `comment_dict(c, user_external_id) -> dict`.

- [ ] **Step 1: Write the failing service tests** — `tests/test_comments_service.py`

```python
import pytest
from app.gestor.service import create_project, create_task
from app.gestor.comments_service import (
    create_comment, list_comments, update_comment, delete_comment, comment_dict,
)

async def _task(session, ext="ext-1"):
    p = await create_project(session, ext, "P")
    return await create_task(session, p.id, ext, title="T")

@pytest.mark.asyncio
async def test_create_and_list_comment_owner(session):
    t = await _task(session)
    c = await create_comment(session, t.id, "ext-1", "Ana", "hola")
    assert c is not None and c.content == "hola" and c.author_name == "Ana"
    comments = await list_comments(session, t.id, "ext-1")
    assert [x.content for x in comments] == ["hola"]

@pytest.mark.asyncio
async def test_create_and_list_blocked_for_other_user(session):
    t = await _task(session)
    assert await create_comment(session, t.id, "ext-2", "X", "hack") is None
    assert await list_comments(session, t.id, "ext-2") is None

@pytest.mark.asyncio
async def test_list_ordered_by_created_at(session):
    t = await _task(session)
    await create_comment(session, t.id, "ext-1", "Ana", "uno")
    await create_comment(session, t.id, "ext-1", "Ana", "dos")
    comments = await list_comments(session, t.id, "ext-1")
    assert [x.content for x in comments] == ["uno", "dos"]

@pytest.mark.asyncio
async def test_update_and_delete_author_only(session):
    t = await _task(session)
    c = await create_comment(session, t.id, "ext-1", "Ana", "hola")
    assert await update_comment(session, c.id, "ext-2", "hack") is None      # not author
    upd = await update_comment(session, c.id, "ext-1", "editado")
    assert upd.content == "editado" and upd.edited_at is not None
    assert await delete_comment(session, c.id, "ext-2") is False             # not author
    assert await delete_comment(session, c.id, "ext-1") is True

@pytest.mark.asyncio
async def test_comment_dict_mine_flag(session):
    t = await _task(session)
    c = await create_comment(session, t.id, "ext-1", "Ana", "hola")
    assert comment_dict(c, "ext-1")["mine"] is True
    assert comment_dict(c, "ext-9")["mine"] is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_comments_service.py -v`
Expected: FAIL — `app.gestor.comments_service` / `TaskComment` do not exist.

- [ ] **Step 3: Add the `TaskComment` model** — `app/gestor/models.py`

Append (the imports `Uuid, String, Text, DateTime, func, ForeignKey, Mapped, mapped_column, datetime, uuid` already exist at the top of this file):

```python
class TaskComment(Base):
    __tablename__ = "task_comments"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    author_external_id: Mapped[str] = mapped_column(String, index=True)
    author_name: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 4: Create the comment services** — `app/gestor/comments_service.py`

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.gestor.models import TaskComment
from app.gestor.service import get_owned_task


async def create_comment(
    session: AsyncSession, task_id: uuid.UUID, user_external_id: str,
    author_name: str | None, content: str,
) -> TaskComment | None:
    task = await get_owned_task(session, task_id, user_external_id)
    if task is None:
        return None
    comment = TaskComment(
        task_id=task_id, author_external_id=user_external_id,
        author_name=author_name, content=content,
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    return comment


async def list_comments(
    session: AsyncSession, task_id: uuid.UUID, user_external_id: str
) -> list[TaskComment] | None:
    task = await get_owned_task(session, task_id, user_external_id)
    if task is None:
        return None
    result = await session.execute(
        select(TaskComment).where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
    )
    return list(result.scalars().all())


async def _own_comment(
    session: AsyncSession, comment_id: uuid.UUID, user_external_id: str
) -> TaskComment | None:
    result = await session.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.author_external_id == user_external_id,
        )
    )
    return result.scalar_one_or_none()


async def update_comment(
    session: AsyncSession, comment_id: uuid.UUID, user_external_id: str, content: str
) -> TaskComment | None:
    comment = await _own_comment(session, comment_id, user_external_id)
    if comment is None:
        return None
    comment.content = content
    comment.edited_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(comment)
    return comment


async def delete_comment(
    session: AsyncSession, comment_id: uuid.UUID, user_external_id: str
) -> bool:
    comment = await _own_comment(session, comment_id, user_external_id)
    if comment is None:
        return False
    await session.delete(comment)
    await session.commit()
    return True


def comment_dict(c, user_external_id: str) -> dict:
    return {
        "id": str(c.id),
        "task_id": str(c.task_id),
        "author_external_id": c.author_external_id,
        "author_name": c.author_name,
        "content": c.content,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
        "mine": c.author_external_id == user_external_id,
    }
```

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_comments_service.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Create the Alembic migration** — `migrations/versions/a7b9c1d3e5f7_task_comments.py`

```python
"""task comments

Revision ID: a7b9c1d3e5f7
Revises: f4a2b6c8d0e1
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b9c1d3e5f7'
down_revision: Union[str, Sequence[str], None] = 'f4a2b6c8d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'task_comments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('task_id', sa.Uuid(), nullable=False),
        sa.Column('author_external_id', sa.String(), nullable=False),
        sa.Column('author_name', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_task_comments_task_id'), 'task_comments', ['task_id'], unique=False)
    op.create_index(op.f('ix_task_comments_author_external_id'), 'task_comments', ['author_external_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_task_comments_author_external_id'), table_name='task_comments')
    op.drop_index(op.f('ix_task_comments_task_id'), table_name='task_comments')
    op.drop_table('task_comments')
```

Verify it applies (or is the new head):

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `f4a2b6c8d0e1 -> a7b9c1d3e5f7` with no error. If no DB is reachable, run `docker compose run --rm api alembic history` and confirm `a7b9c1d3e5f7` is the head after `f4a2b6c8d0e1`; note which you verified.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/gestor/models.py app/gestor/comments_service.py migrations/versions/a7b9c1d3e5f7_task_comments.py tests/test_comments_service.py
git commit -m "feat: task comments model, services, and migration"
```

> Commit only the listed files (do NOT `git add -A` — the repo may have untracked build artifacts/docs from other work).

---

### Task 2: Backend comment API endpoints

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/api/tasks.py`, `app/main.py`
- Create: `app/api/comments.py`
- Test: `tests/test_tasks_endpoint.py`

**Interfaces:**
- Consumes: `list_comments`, `create_comment`, `update_comment`, `delete_comment`, `comment_dict` from `app.gestor.comments_service`; `get_current_user`.
- Produces:
  - `GET /api/tasks/{id}/comments` → `[comment dict]` (404 if task not owned).
  - `POST /api/tasks/{id}/comments` body `{content}` → created dict (404 if task not owned).
  - `PATCH /api/comments/{id}` body `{content}` → updated dict (404 unless author).
  - `DELETE /api/comments/{id}` → `{deleted: true}` (404 unless author).

- [ ] **Step 1: Write the failing endpoint tests** — append to `tests/test_tasks_endpoint.py`

(Reuse this file's existing `client`, `_token`, `_make_task`.)

```python
@pytest.mark.asyncio
async def test_create_list_comment(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        rc = await ac.post(f"/api/tasks/{tid}/comments", json={"content": "hola"}, headers=h)
        assert rc.status_code == 200
        assert rc.json()["content"] == "hola" and rc.json()["mine"] is True
        rl = await ac.get(f"/api/tasks/{tid}/comments", headers=h)
        assert rl.status_code == 200 and [c["content"] for c in rl.json()] == ["hola"]

@pytest.mark.asyncio
async def test_comment_on_other_users_task_404(client):
    async with client as ac:
        tid = await _make_task(ac, {"Authorization": f"Bearer {_token(sub='owner')}"})
        r = await ac.post(f"/api/tasks/{tid}/comments", json={"content": "x"},
                          headers={"Authorization": f"Bearer {_token(sub='intruder')}"})
        assert r.status_code == 404

@pytest.mark.asyncio
async def test_edit_and_delete_own_comment(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        tid = await _make_task(ac, h)
        cid = (await ac.post(f"/api/tasks/{tid}/comments", json={"content": "hola"}, headers=h)).json()["id"]
        re = await ac.patch(f"/api/comments/{cid}", json={"content": "editado"}, headers=h)
        assert re.status_code == 200 and re.json()["content"] == "editado" and re.json()["edited_at"] is not None
        rd = await ac.delete(f"/api/comments/{cid}", headers=h)
        assert rd.status_code == 200 and rd.json()["deleted"] is True

@pytest.mark.asyncio
async def test_edit_other_users_comment_404(client):
    async with client as ac:
        owner_h = {"Authorization": f"Bearer {_token(sub='owner')}"}
        # owner creates a task + comment
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=owner_h)).json()["id"]
        tid = (await ac.post(f"/api/projects/{pid}/tasks", json={"title": "T"}, headers=owner_h)).json()["id"]
        cid = (await ac.post(f"/api/tasks/{tid}/comments", json={"content": "hola"}, headers=owner_h)).json()["id"]
        # intruder cannot edit it
        r = await ac.patch(f"/api/comments/{cid}", json={"content": "hack"},
                           headers={"Authorization": f"Bearer {_token(sub='intruder')}"})
        assert r.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_tasks_endpoint.py -k comment -v`
Expected: FAIL — endpoints missing (404 for a different reason / route not found).

- [ ] **Step 3: Add the nested comment endpoints** — `app/api/tasks.py`

Add the import and a body model, then the two endpoints (after the existing subtask endpoints):

```python
from app.gestor.comments_service import list_comments, create_comment, comment_dict
```
```python
class CommentBody(BaseModel):
    content: str
```
```python
@router.get("/{task_id}/comments")
async def listar_comentarios(task_id: uuid.UUID, user: User = Depends(get_current_user),
                             session: AsyncSession = Depends(get_session)) -> list[dict]:
    cs = await list_comments(session, task_id, user.external_id)
    if cs is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return [comment_dict(c, user.external_id) for c in cs]

@router.post("/{task_id}/comments")
async def crear_comentario(task_id: uuid.UUID, body: CommentBody,
                           user: User = Depends(get_current_user),
                           session: AsyncSession = Depends(get_session)) -> dict:
    c = await create_comment(session, task_id, user.external_id, user.name, body.content)
    if c is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return comment_dict(c, user.external_id)
```

- [ ] **Step 4: Create the flat comment router** — `app/api/comments.py`

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.db import get_session
from app.gestor.comments_service import update_comment, delete_comment, comment_dict

router = APIRouter(prefix="/api/comments", tags=["gestor"])


class CommentUpdateBody(BaseModel):
    content: str


@router.patch("/{comment_id}")
async def actualizar(comment_id: uuid.UUID, body: CommentUpdateBody,
                     user: User = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> dict:
    c = await update_comment(session, comment_id, user.external_id, body.content)
    if c is None:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    return comment_dict(c, user.external_id)


@router.delete("/{comment_id}")
async def borrar(comment_id: uuid.UUID, user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> dict:
    ok = await delete_comment(session, comment_id, user.external_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    return {"deleted": True}
```

- [ ] **Step 5: Register the comments router** — `app/main.py`

Add `comments` to the api import and include it:

```python
from app.api import chat, documentos, erp, projects, tasks, comments
```
```python
app.include_router(tasks.router)
app.include_router(comments.router)
```

- [ ] **Step 6: Run the endpoint tests, then the full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_tasks_endpoint.py -k comment -v
docker compose run --rm api pytest -q
```
Expected: the comment tests pass; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/api/tasks.py app/api/comments.py app/main.py tests/test_tasks_endpoint.py
git commit -m "feat: comment endpoints (list/create nested, edit/delete flat)"
```

---

### Task 3: Frontend data layer — comment types, api, hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`
- Test: `tests/comment-queries.test.tsx` (create)

**Interfaces:**
- Produces:
  - `TaskComment` type.
  - `listComments(token, taskId)`, `createComment(token, taskId, content)`, `updateComment(token, commentId, content)`, `deleteComment(token, commentId)`.
  - `useComments(taskId)` → `['comments', taskId]`; `useCreateComment(taskId)` mutate `content: string`; `useUpdateComment(taskId)` mutate `{ commentId; content }`; `useDeleteComment(taskId)` mutate `commentId: string`. All invalidate `['comments', taskId]`.

- [ ] **Step 1: Write the failing test** — `tests/comment-queries.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useComments, useCreateComment, useUpdateComment, useDeleteComment } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useComments loads comments via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listComments').mockResolvedValue([] as never)
  const { result } = renderHook(() => useComments('t1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 't1')
})

it('useCreateComment posts content via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'createComment').mockResolvedValue({} as never)
  const { result } = renderHook(() => useCreateComment('t1'), { wrapper: wrapper() })
  result.current.mutate('hola')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 't1', 'hola'))
})

it('useUpdateComment patches content via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'updateComment').mockResolvedValue({} as never)
  const { result } = renderHook(() => useUpdateComment('t1'), { wrapper: wrapper() })
  result.current.mutate({ commentId: 'c1', content: 'editado' })
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'c1', 'editado'))
})

it('useDeleteComment deletes via the api', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'deleteComment').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useDeleteComment('t1'), { wrapper: wrapper() })
  result.current.mutate('c1')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'c1'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/comment-queries.test.tsx`
Expected: FAIL — hooks / api functions not exported.

- [ ] **Step 3: Add the `TaskComment` type** — `lib/types.ts`

```ts
export interface TaskComment {
  id: string
  task_id: string
  author_external_id: string
  author_name: string | null
  content: string
  created_at: string
  edited_at: string | null
  mine: boolean
}
```

- [ ] **Step 4: Add the api functions** — `lib/api.ts`

Change the type import to include `TaskComment` and append the four functions:

```ts
import type { Project, Task, TaskStatus, TaskComment } from '@/lib/types'
```
```ts
export const listComments = (token: string, taskId: string) =>
  apiFetch<TaskComment[]>(`/api/tasks/${taskId}/comments`, { token })

export const createComment = (token: string, taskId: string, content: string) =>
  apiFetch<TaskComment>(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { content }, token })

export const updateComment = (token: string, commentId: string, content: string) =>
  apiFetch<TaskComment>(`/api/comments/${commentId}`, { method: 'PATCH', body: { content }, token })

export const deleteComment = (token: string, commentId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/comments/${commentId}`, { method: 'DELETE', token })
```

- [ ] **Step 5: Add the hooks** — `lib/queries.ts`

Append:

```ts
export function useComments(taskId: string) {
  return useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => api.listComments(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api.createComment(token(), taskId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}

export function useUpdateComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { commentId: string; content: string }) =>
      api.updateComment(token(), v.commentId, v.content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(token(), commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/comment-queries.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts tests/comment-queries.test.tsx
git commit -m "feat: comment types, api, and query hooks"
```

---

### Task 4: `CommentsSection` in the panel

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `components/kanban/CommentsSection.tsx`, `tests/comments-section.test.tsx`
- Modify: `components/kanban/TaskDetailPanel.tsx`, `tests/task-detail-panel.test.tsx`, `tests/kanban-open.test.tsx`

**Interfaces:**
- Consumes: `useComments`, `useCreateComment`, `useUpdateComment`, `useDeleteComment`; `TaskComment`.
- Produces: `CommentsSection({ taskId })` (default export). Panel mounts `<CommentsSection taskId={current.id} />`.

- [ ] **Step 1: Write the failing test** — `tests/comments-section.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { TaskComment } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const mine: TaskComment = {
  id: 'c1', task_id: 't1', author_external_id: 'me', author_name: 'Yo',
  content: 'mío', created_at: '2026-07-04T10:00:00+00:00', edited_at: null, mine: true,
}
const other: TaskComment = {
  id: 'c2', task_id: 't1', author_external_id: 'x', author_name: 'Otro',
  content: 'ajeno', created_at: '2026-07-04T11:00:00+00:00', edited_at: null, mine: false,
}

function stub(comments: TaskComment[]) {
  const create = vi.fn(); const update = vi.fn(); const del = vi.fn()
  vi.spyOn(queries, 'useComments').mockReturnValue({ data: comments } as never)
  vi.spyOn(queries, 'useCreateComment').mockReturnValue({ mutate: create } as never)
  vi.spyOn(queries, 'useUpdateComment').mockReturnValue({ mutate: update } as never)
  vi.spyOn(queries, 'useDeleteComment').mockReturnValue({ mutate: del } as never)
  return { create, update, del }
}

it('lists comments and shows edit/delete only on mine', async () => {
  stub([mine, other])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  expect(screen.getByText('mío')).toBeInTheDocument()
  expect(screen.getByText('ajeno')).toBeInTheDocument()
  // exactly one edit + one delete control (only for the mine comment)
  expect(screen.getAllByLabelText('editar comentario')).toHaveLength(1)
  expect(screen.getAllByLabelText('borrar comentario')).toHaveLength(1)
})

it('creates a comment', async () => {
  const { create } = stub([])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.change(screen.getByLabelText('nuevo comentario'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar comentario'))
  expect(create).toHaveBeenCalledWith('hola')
})

it('edits a comment inline', async () => {
  const { update } = stub([mine])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.click(screen.getByLabelText('editar comentario'))
  const box = screen.getByLabelText('editar contenido')
  fireEvent.change(box, { target: { value: 'corregido' } })
  fireEvent.click(screen.getByLabelText('guardar comentario'))
  expect(update).toHaveBeenCalledWith({ commentId: 'c1', content: 'corregido' })
})

it('deletes a comment after confirm', async () => {
  const { del } = stub([mine])
  const { default: Section } = await import('@/components/kanban/CommentsSection')
  render(<Section taskId="t1" />)
  fireEvent.click(screen.getByLabelText('borrar comentario'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado' }))
  expect(del).toHaveBeenCalledWith('c1')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/comments-section.test.tsx`
Expected: FAIL — cannot resolve `@/components/kanban/CommentsSection`.

- [ ] **Step 3: Create `components/kanban/CommentsSection.tsx`**

```tsx
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
```

- [ ] **Step 4: Run the section test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/comments-section.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Mount the section in the panel** — `components/kanban/TaskDetailPanel.tsx`

Add the import at the top:

```tsx
import CommentsSection from './CommentsSection'
```

Insert the section between the end of the subtasks `<div>` and `</aside>` — i.e. immediately after the closing `</div>` of the subtasks block and before `</aside>`:

```tsx
        {current && <CommentsSection taskId={current.id} />}
      </aside>
```

- [ ] **Step 6: Update the panel + board-open test mocks**

The panel now mounts `CommentsSection`, which calls `useComments` + `useCreateComment` whenever `current` is truthy. Both test files stub the panel's hooks and must add these so the panel renders:

In `tests/task-detail-panel.test.tsx`, inside its `stub()` helper (alongside the other `vi.spyOn(queries, …)` lines), add:
```tsx
  vi.spyOn(queries, 'useComments').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useCreateComment').mockReturnValue({ mutate: vi.fn() } as never)
```

In `tests/kanban-open.test.tsx`, inside its `stub()` helper, add the same two lines.

(`useUpdateComment`/`useDeleteComment` are only invoked by `CommentItem`, which is not rendered when the comment list is empty — so they don't need stubbing in these two files.)

- [ ] **Step 7: Run the panel + board-open tests, then the full suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/comments-section.test.tsx tests/task-detail-panel.test.tsx tests/kanban-open.test.tsx
npx vitest run
npm run build
```
Expected: targeted files pass; full suite passes; build compiles.

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add components/kanban/CommentsSection.tsx components/kanban/TaskDetailPanel.tsx tests/comments-section.test.tsx tests/task-detail-panel.test.tsx tests/kanban-open.test.tsx
git commit -m "feat: comments section in the task detail panel"
```

---

## Out of scope (this plan)

- Menciones (@usuario), reacciones, adjuntos, notificaciones, tiempo real (websockets), markdown/rich text.
- Compartir tareas con equipo (varios autores) — slice aparte; el modelo ya lo soporta.
- Backlog fast-follow heredado (progreso en tarjeta, click parásito tras drag, `--text-muted`, `due_date=""`→null, `useCallback` en Esc) — no se aborda aquí.
- Formateo bonito de `created_at` (se muestra el ISO tal cual) → mejora posterior.

## Self-Review

**Spec coverage:**
- `TaskComment` model + migración → Task 1. ✅
- Servicios: create/list (owner-scoped→404), update/delete (author-scoped→404), `edited_at`, `comment_dict` con `mine` → Task 1. ✅
- Endpoints `GET/POST /api/tasks/{id}/comments`, `PATCH/DELETE /api/comments/{id}`, router registrado → Task 2. ✅
- Tipos + api (4) + hooks (4, invalidan `['comments',taskId]`) → Task 3. ✅
- `CommentsSection`: hilo cronológico, editar/borrar solo en `mine`, editar inline, borrar dos pasos, crear; montado con `current.id` → Task 4. ✅
- Orden ascendente (backend `order_by created_at`) → Task 1. CASCADE → Task 1 (FK). ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (modelo, migración `a7b9c1d3e5f7`←`f4a2b6c8d0e1`, servicios, endpoints, router, main, tipos, api, hooks, sección). ✅

**Type consistency:** `useUpdateComment` mutate `{commentId, content}` coincide entre Task 3 (def), su test, y `CommentItem` (Task 4). `useCreateComment` mutate `content:string`; `useDeleteComment` mutate `commentId:string` — coinciden def/test/uso. `createComment(token,taskId,content)`/`updateComment(token,commentId,content)`/`deleteComment(token,commentId)` coinciden api↔hooks. `TaskComment` (Task 3) usado por la sección y sus tests. aria-labels `nuevo comentario`/`enviar comentario`/`editar comentario`/`editar contenido`/`guardar comentario`/`borrar comentario` + botón `Confirmar borrado` consistentes entre `CommentsSection` (Task 4) y su test. Panel monta `<CommentsSection taskId={current.id} />` (Task 4). `comment_dict` en `comments_service.py` importado por tasks.py y comments.py (Task 1/2). ✅
