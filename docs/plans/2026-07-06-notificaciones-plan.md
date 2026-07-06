# Notificaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users get notifications when assigned a task, added to a project, or when their assigned task is commented on; they read them on a `/notifications` page with an unread badge in the sidebar.

**Architecture:** A new `Notification` model + service. Three triggers inside existing services (`update_task`, `add_member`, `create_comment`) call `create_notification`, each guarding against self-notification. New endpoints list/mark/mark-all (recipient-scoped). The frontend polls the list and renders a page + a sidebar badge.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Tasks 1–3 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 4–5 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **Three triggers, each with a "don't notify yourself" guard:** assigned (assignee changed & != editor), shared (a NEW member added, != owner), comment (task assignee set & != comment author).
- **Recipient-scoped:** list/mark only the user's own notifications; a foreign notification → **404**.
- **Generic messages with the entity title, no actor name.** Delivery is polling (~20s). Clicking a notification only marks it read.
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>` (register the new model in `tests/conftest.py`). **Frontend tests run on the HOST:** `npx vitest run <path>`.
- Dark tokens. TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).

---

## File Structure

**Backend (`idled-backend`):**
- `app/notifications/models.py`, `app/notifications/service.py`, `app/notifications/__init__.py` — NEW module.
- `migrations/versions/d0e2f4a6b8c1_notifications.py` — NEW.
- `tests/conftest.py` — register the model.
- `app/gestor/service.py` (`update_task`, `add_member`), `app/gestor/comments_service.py` (`create_comment`) — triggers.
- `app/api/notifications.py` — NEW router; `app/main.py` — register.
- Tests: `tests/test_notifications_service.py`, `tests/test_notifications_triggers.py` (new), `tests/test_projects_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/types.ts`, `lib/api.ts`, `lib/queries.ts` — Notification type, api, hooks.
- `app/(app)/notifications/page.tsx` — NEW page.
- `components/Sidebar.tsx` — link + unread badge.
- Tests: `tests/notification-queries.test.tsx` (new), `tests/notifications-page.test.tsx` (new), `tests/shell.test.tsx`.

---

### Task 1: Backend — Notification model, migration, and service

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Create: `app/notifications/__init__.py`, `app/notifications/models.py`, `app/notifications/service.py`, `migrations/versions/d0e2f4a6b8c1_notifications.py`, `tests/test_notifications_service.py`
- Modify: `tests/conftest.py`

**Interfaces:**
- Produces:
  - `Notification` model.
  - `create_notification(session, user_external_id, type, message, task_id=None, project_id=None) -> Notification`.
  - `list_notifications(session, user_external_id) -> list[Notification]` (newest first).
  - `mark_read(session, notification_id, user_external_id) -> bool` (recipient-scoped).
  - `mark_all_read(session, user_external_id) -> int`.

- [ ] **Step 1: Write the failing service tests** — `tests/test_notifications_service.py`

```python
import pytest
from app.notifications.service import (
    create_notification, list_notifications, mark_read, mark_all_read,
)

@pytest.mark.asyncio
async def test_create_list_newest_first_and_scoped(session):
    a = await create_notification(session, "u1", "assigned", "una")
    b = await create_notification(session, "u1", "shared", "dos")
    await create_notification(session, "u2", "assigned", "otra")
    mine = await list_notifications(session, "u1")
    assert [n.id for n in mine] == [b.id, a.id]        # newest first
    assert all(n.user_external_id == "u1" for n in mine)  # scoped

@pytest.mark.asyncio
async def test_mark_read_recipient_only(session):
    n = await create_notification(session, "u1", "assigned", "x")
    assert await mark_read(session, n.id, "u2") is False   # not the recipient
    assert await mark_read(session, n.id, "u1") is True
    assert (await list_notifications(session, "u1"))[0].read is True

@pytest.mark.asyncio
async def test_mark_all_read(session):
    await create_notification(session, "u1", "assigned", "a")
    await create_notification(session, "u1", "shared", "b")
    marked = await mark_all_read(session, "u1")
    assert marked == 2
    assert all(n.read for n in await list_notifications(session, "u1"))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_notifications_service.py -v`
Expected: FAIL — `app.notifications.service` does not exist.

- [ ] **Step 3: Create the module** — `app/notifications/__init__.py` (empty), `app/notifications/models.py`

`app/notifications/__init__.py`: an empty file.

`app/notifications/models.py`:

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_external_id: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
```

- [ ] **Step 4: Create the service** — `app/notifications/service.py`

```python
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.notifications.models import Notification


async def create_notification(
    session: AsyncSession, user_external_id: str, type: str, message: str,
    task_id: uuid.UUID | None = None, project_id: uuid.UUID | None = None,
) -> Notification:
    n = Notification(
        user_external_id=user_external_id, type=type, message=message,
        task_id=task_id, project_id=project_id,
    )
    session.add(n)
    await session.commit()
    await session.refresh(n)
    return n


async def list_notifications(
    session: AsyncSession, user_external_id: str
) -> list[Notification]:
    result = await session.execute(
        select(Notification).where(Notification.user_external_id == user_external_id)
        .order_by(Notification.created_at.desc())
    )
    return list(result.scalars().all())


async def mark_read(
    session: AsyncSession, notification_id: uuid.UUID, user_external_id: str
) -> bool:
    result = await session.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_external_id == user_external_id,
        )
    )
    n = result.scalar_one_or_none()
    if n is None:
        return False
    n.read = True
    await session.commit()
    return True


async def mark_all_read(session: AsyncSession, user_external_id: str) -> int:
    result = await session.execute(
        select(Notification).where(
            Notification.user_external_id == user_external_id,
            Notification.read == False,  # noqa: E712 (SQLAlchemy needs == False)
        )
    )
    rows = list(result.scalars().all())
    for n in rows:
        n.read = True
    await session.commit()
    return len(rows)
```

- [ ] **Step 5: Register the model in conftest** — `tests/conftest.py`

Add next to the other model imports:

```python
import app.notifications.models  # noqa: F401 — registers Notification with Base.metadata
```

- [ ] **Step 6: Run the service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_notifications_service.py -v`
Expected: PASS (3 tests).

- [ ] **Step 7: Create the Alembic migration** — `migrations/versions/d0e2f4a6b8c1_notifications.py`

```python
"""notifications

Revision ID: d0e2f4a6b8c1
Revises: c9d1e3f5a7b2
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0e2f4a6b8c1'
down_revision: Union[str, Sequence[str], None] = 'c9d1e3f5a7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'notifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_external_id', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('task_id', sa.Uuid(), nullable=True),
        sa.Column('project_id', sa.Uuid(), nullable=True),
        sa.Column('read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_user_external_id'), 'notifications', ['user_external_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_notifications_user_external_id'), table_name='notifications')
    op.drop_table('notifications')
```

Verify it applies (or is the new head):

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `c9d1e3f5a7b2 -> d0e2f4a6b8c1`. If no DB is reachable, run `docker compose run --rm api alembic history` and confirm `d0e2f4a6b8c1` is the head; note which you verified.

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/notifications/__init__.py app/notifications/models.py app/notifications/service.py migrations/versions/d0e2f4a6b8c1_notifications.py tests/conftest.py tests/test_notifications_service.py
git commit -m "feat: notification model, service, and migration"
```

---

### Task 2: Backend — the three notification triggers

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/service.py` (`update_task`, `add_member`), `app/gestor/comments_service.py` (`create_comment`)
- Test: `tests/test_notifications_triggers.py` (create)

**Interfaces:**
- Consumes: `create_notification` (from Task 1), `list_notifications`, `create_project`, `create_task`, `update_task`, `add_member`, `create_comment`, `ProjectMember`.

- [ ] **Step 1: Write the failing trigger tests** — `tests/test_notifications_triggers.py`

```python
import pytest
from app.gestor.models import ProjectMember
from app.gestor.service import create_project, create_task, update_task, add_member
from app.gestor.comments_service import create_comment
from app.notifications.service import list_notifications

async def _member(session, project_id, ext):
    session.add(ProjectMember(project_id=project_id, user_external_id=ext))
    await session.commit()

@pytest.mark.asyncio
async def test_assign_notifies_new_assignee_not_self(session):
    p = await create_project(session, "owner", "P")
    await _member(session, p.id, "ext-2")
    t = await create_task(session, p.id, "owner", title="A")
    await update_task(session, t.id, "owner", assignee="ext-2")
    ns = await list_notifications(session, "ext-2")
    assert len(ns) == 1 and ns[0].type == "assigned" and ns[0].task_id == t.id
    # reassigning to the same person creates nothing new
    await update_task(session, t.id, "owner", assignee="ext-2")
    assert len(await list_notifications(session, "ext-2")) == 1
    # the owner assigning themselves gets no notification
    await update_task(session, t.id, "owner", assignee="owner")
    assert len(await list_notifications(session, "owner")) == 0

@pytest.mark.asyncio
async def test_add_member_notifies_new_member(session):
    p = await create_project(session, "owner", "P")
    assert await add_member(session, p.id, "owner", "ext-2") is True
    ns = await list_notifications(session, "ext-2")
    assert len(ns) == 1 and ns[0].type == "shared" and ns[0].project_id == p.id
    # adding an existing member creates nothing new
    await add_member(session, p.id, "owner", "ext-2")
    assert len(await list_notifications(session, "ext-2")) == 1

@pytest.mark.asyncio
async def test_comment_notifies_assignee_not_author(session):
    p = await create_project(session, "owner", "P")
    await _member(session, p.id, "ext-2")
    t = await create_task(session, p.id, "owner", title="A")
    await update_task(session, t.id, "owner", assignee="ext-2")   # 1 "assigned" for ext-2
    await create_comment(session, t.id, "ext-2", "Bea", "hola")   # self-comment → no notification
    await create_comment(session, t.id, "owner", "Dueño", "revisa")  # notifies assignee ext-2
    comments = [n for n in await list_notifications(session, "ext-2") if n.type == "comment"]
    assert len(comments) == 1 and comments[0].task_id == t.id
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_notifications_triggers.py -v`
Expected: FAIL — no notifications are created by the triggers yet.

- [ ] **Step 3: Add the `assigned` + `shared` triggers** — `app/gestor/service.py`

Add the import at the top:

```python
from app.notifications.service import create_notification
```

In `update_task`, capture whether to notify in the assignee branch and fire it after the commit. Replace the assignee branch + the commit/return tail:

```python
    notify_assignee = None
    if assignee is not None:
        if assignee != "" and not await is_project_member(session, task.project_id, assignee):
            raise ValueError("Asignado no es miembro")
        if assignee != "" and assignee != task.assignee and assignee != user_external_id:
            notify_assignee = assignee
        task.assignee = assignee
    if due_date is not None:
        task.due_date = due_date
    if description is not None:
        task.description = description
    await session.commit()
    await session.refresh(task)
    if notify_assignee is not None:
        await create_notification(
            session, notify_assignee, "assigned",
            f"Te han asignado la tarea «{task.title}»",
            task_id=task.id, project_id=task.project_id,
        )
    return task
```
(The `status`/`title`/`task_type` branches above the assignee branch stay unchanged.)

In `add_member`, notify only inside the genuine-insert branch:

```python
    if existing.scalar_one_or_none() is None:
        session.add(ProjectMember(project_id=project_id, user_external_id=member_external_id))
        await session.commit()
        await create_notification(
            session, member_external_id, "shared",
            f"Te han añadido al proyecto «{project.name}»",
            project_id=project_id,
        )
    return True
```

- [ ] **Step 4: Add the `comment` trigger** — `app/gestor/comments_service.py`

Add the import:

```python
from app.notifications.service import create_notification
```

In `create_comment`, after `await session.refresh(comment)`, notify the assignee:

```python
    session.add(comment)
    await session.commit()
    await session.refresh(comment)
    if task.assignee and task.assignee != user_external_id:
        await create_notification(
            session, task.assignee, "comment",
            f"Nuevo comentario en «{task.title}»",
            task_id=task.id, project_id=task.project_id,
        )
    return comment
```

- [ ] **Step 5: Run the trigger tests, then guard the existing gestor tests**

Run:
```bash
docker compose run --rm api pytest tests/test_notifications_triggers.py -v
docker compose run --rm api pytest tests/test_gestor_tasks_service.py tests/test_gestor_subtasks.py tests/test_comments_service.py tests/test_gestor_sharing.py -v
```
Expected: the trigger tests pass; the existing gestor/comment tests still pass (adding a notification row does not change their assertions). If any regress, fix the trigger, do not weaken the test.

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/gestor/service.py app/gestor/comments_service.py tests/test_notifications_triggers.py
git commit -m "feat: notify on assign, share, and comment (self-excluded)"
```

---

### Task 3: Backend — notification endpoints

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Create: `app/api/notifications.py`
- Modify: `app/main.py`
- Test: `tests/test_projects_endpoint.py`

**Interfaces:**
- Consumes: `list_notifications`, `mark_read`, `mark_all_read`; the `add_member` trigger (to create a notification in the test).
- Produces: `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`.

- [ ] **Step 1: Write the failing endpoint test** — append to `tests/test_projects_endpoint.py`

(Reuse this file's `client` fixture and `_token(sub=…)`. Adding a member triggers a `shared` notification for that member — used here to create one.)

```python
@pytest.mark.asyncio
async def test_notifications_endpoints(client):
    async with client as ac:
        ho = {"Authorization": f"Bearer {_token(sub='owner')}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=ho)).json()["id"]
        # adding ext-2 as a member creates a "shared" notification for ext-2
        await ac.post(f"/api/projects/{pid}/members", json={"external_id": "ext-2"}, headers=ho)
        hm = {"Authorization": f"Bearer {_token(sub='ext-2')}"}
        lst = (await ac.get("/api/notifications", headers=hm)).json()
        assert len(lst) == 1 and lst[0]["type"] == "shared" and lst[0]["read"] is False
        nid = lst[0]["id"]
        # the owner cannot mark ext-2's notification read → 404
        assert (await ac.post(f"/api/notifications/{nid}/read", headers=ho)).status_code == 404
        # ext-2 marks it read → 200, then it reads back as read
        assert (await ac.post(f"/api/notifications/{nid}/read", headers=hm)).status_code == 200
        assert (await ac.get("/api/notifications", headers=hm)).json()[0]["read"] is True
        # read-all returns the count marked (0 now, already read)
        assert (await ac.post("/api/notifications/read-all", headers=hm)).json() == {"marked": 0}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_projects_endpoint.py::test_notifications_endpoints -v`
Expected: FAIL — `/api/notifications` routes not found.

- [ ] **Step 3: Create the router** — `app/api/notifications.py`

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.db import get_session
from app.notifications.service import list_notifications, mark_read, mark_all_read

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _notification_dict(n) -> dict:
    return {
        "id": str(n.id), "type": n.type, "message": n.message,
        "task_id": str(n.task_id) if n.task_id else None,
        "project_id": str(n.project_id) if n.project_id else None,
        "read": n.read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def listar(user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> list[dict]:
    ns = await list_notifications(session, user.external_id)
    return [_notification_dict(n) for n in ns]


@router.post("/read-all")
async def marcar_todas(user: User = Depends(get_current_user),
                       session: AsyncSession = Depends(get_session)) -> dict:
    marked = await mark_all_read(session, user.external_id)
    return {"marked": marked}


@router.post("/{notification_id}/read")
async def marcar(notification_id: uuid.UUID, user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> dict:
    ok = await mark_read(session, notification_id, user.external_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"ok": True}
```
> Declare `/read-all` BEFORE `/{notification_id}/read` so the literal path is matched first (otherwise `read-all` could bind `notification_id` and fail UUID parsing).

- [ ] **Step 4: Register the router** — `app/main.py`

```python
from app.api import chat, documentos, erp, projects, tasks, comments, users, notifications
```
```python
app.include_router(users.router)
app.include_router(notifications.router)
```

- [ ] **Step 5: Run the endpoint test + full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_projects_endpoint.py -v
docker compose run --rm api pytest -q
```
Expected: the new test passes; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/api/notifications.py app/main.py tests/test_projects_endpoint.py
git commit -m "feat: notification endpoints (list, mark read, mark all read)"
```

---

### Task 4: Frontend — notification types, api, and hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`
- Test: `tests/notification-queries.test.tsx` (create)

**Interfaces:**
- Produces:
  - `Notification { id: string; type: string; message: string; task_id: string | null; project_id: string | null; read: boolean; created_at: string }`.
  - `listNotifications(token)`, `markNotificationRead(token, id)`, `markAllNotificationsRead(token)`.
  - `useNotifications()` → `['notifications']`, `refetchInterval: 20000`; `useMarkNotificationRead()` mutate `id`; `useMarkAllNotificationsRead()` mutate `void`.

- [ ] **Step 1: Write the failing test** — `tests/notification-queries.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useNotifications loads with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listNotifications').mockResolvedValue([] as never)
  const { result } = renderHook(() => useNotifications(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMarkNotificationRead marks one with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'markNotificationRead').mockResolvedValue({ ok: true })
  const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: wrapper() })
  result.current.mutate('n1')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'n1'))
})

it('useMarkAllNotificationsRead marks all with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'markAllNotificationsRead').mockResolvedValue({ marked: 2 })
  const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: wrapper() })
  result.current.mutate()
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok'))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/notification-queries.test.tsx`
Expected: FAIL — hooks / api functions not exported.

- [ ] **Step 3: Add the type** — `lib/types.ts`

```ts
export interface Notification {
  id: string
  type: string
  message: string
  task_id: string | null
  project_id: string | null
  read: boolean
  created_at: string
}
```

- [ ] **Step 4: Add the api functions** — `lib/api.ts`

Extend the type import and append the functions:

```ts
import type { Project, Task, TaskStatus, TaskComment, Conversation, ChatMessage, DocumentItem, UserDir, Member, Notification } from '@/lib/types'
```
```ts
export const listNotifications = (token: string) =>
  apiFetch<Notification[]>('/api/notifications', { token })

export const markNotificationRead = (token: string, id: string) =>
  apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST', token })

export const markAllNotificationsRead = (token: string) =>
  apiFetch<{ marked: number }>('/api/notifications/read-all', { method: 'POST', token })
```

- [ ] **Step 5: Add the hooks** — `lib/queries.ts`

Append:

```ts
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(token()),
    enabled: Boolean(getToken()),
    refetchInterval: 20000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(token()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/notification-queries.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts tests/notification-queries.test.tsx
git commit -m "feat: notification type, api, and query hooks"
```

---

### Task 5: Frontend — notifications page + sidebar badge

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `app/(app)/notifications/page.tsx`, `tests/notifications-page.test.tsx`
- Modify: `components/Sidebar.tsx`, `tests/shell.test.tsx`

**Interfaces:**
- Consumes: `useNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`.

- [ ] **Step 1: Write the failing tests**

Create `tests/notifications-page.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Notification } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const items: Notification[] = [
  { id: 'n1', type: 'assigned', message: 'Te han asignado la tarea «A»', task_id: 't1', project_id: 'p1', read: false, created_at: '2026-07-06T10:00:00+00:00' },
  { id: 'n2', type: 'shared', message: 'Te han añadido al proyecto «P»', task_id: null, project_id: 'p1', read: true, created_at: '2026-07-06T09:00:00+00:00' },
]

function stub(list: Notification[]) {
  const markRead = vi.fn(); const markAll = vi.fn()
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: list } as never)
  vi.spyOn(queries, 'useMarkNotificationRead').mockReturnValue({ mutate: markRead } as never)
  vi.spyOn(queries, 'useMarkAllNotificationsRead').mockReturnValue({ mutate: markAll } as never)
  return { markRead, markAll }
}

it('lists notifications and marks one read on click', async () => {
  const { markRead } = stub(items)
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  expect(screen.getAllByTestId('notification-item')).toHaveLength(2)
  expect(screen.getByText('Te han asignado la tarea «A»')).toBeInTheDocument()
  fireEvent.click(screen.getAllByTestId('notification-item')[0])
  expect(markRead).toHaveBeenCalledWith('n1')
})

it('marks all read', async () => {
  const { markAll } = stub(items)
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  fireEvent.click(screen.getByLabelText('marcar todas'))
  expect(markAll).toHaveBeenCalled()
})

it('shows an empty state', async () => {
  stub([])
  const { default: Page } = await import('@/app/(app)/notifications/page')
  render(<Page />)
  expect(screen.getByText('Sin notificaciones')).toBeInTheDocument()
})
```

Append to `tests/shell.test.tsx` (which renders `Sidebar` and imports `* as auth`; add `* as queries from '@/lib/queries'` if not present). Because `Sidebar` will now call `useNotifications`, the existing `Sidebar`-rendering tests need it mocked — add `vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [] } as never)` to those tests' setup. Then a new badge test:

```tsx
it('shows an unread badge and a Notificaciones link', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [
    { id: 'n1', type: 'assigned', message: 'x', task_id: null, project_id: null, read: false, created_at: '' },
    { id: 'n2', type: 'shared', message: 'y', task_id: null, project_id: null, read: false, created_at: '' },
  ] } as never)
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  const link = screen.getByRole('link', { name: /Notificaciones/ })
  expect(link).toHaveAttribute('href', '/notifications')
  expect(screen.getByTestId('unread-badge')).toHaveTextContent('2')
})
```
> If `tests/shell.test.tsx` renders `Sidebar` in multiple tests, add the `useNotifications` mock (returning `{ data: [] }`) to each so none hit the real hook without a QueryClient. The existing "Dashboard renders" and logout tests only need the empty mock.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/notifications-page.test.tsx tests/shell.test.tsx`
Expected: FAIL — page missing; Sidebar has no badge/link (still a placeholder).

- [ ] **Step 3: Create the page** — `app/(app)/notifications/page.tsx`

```tsx
'use client'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/queries'

export default function NotificationsPage() {
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const list = notifications ?? []

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontWeight: 700 }}>Notificaciones</h1>
        <button aria-label="marcar todas" onClick={() => markAll.mutate()}
          style={{ padding: '8px 12px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Marcar todas como leídas
        </button>
      </div>
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>Sin notificaciones</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((n) => (
            <button key={n.id} data-testid="notification-item" onClick={() => markRead.mutate(n.id)}
              style={{
                textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer', color: 'var(--text)',
                background: n.read ? 'var(--bg-2)' : 'var(--bg-3)',
                border: `1px solid ${n.read ? 'var(--border)' : 'var(--accent)'}`,
              }}>
              <div>{n.message}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{n.created_at}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add the link + badge to the sidebar** — `components/Sidebar.tsx`

Add the imports and the notifications query, remove `'Notificaciones'` from `PLACEHOLDERS`, and render a real link with a badge. At the top of the file:

```tsx
import { useNotifications } from '@/lib/queries'
```
Change `PLACEHOLDERS` to drop Notificaciones:

```tsx
const PLACEHOLDERS = ['Chat de equipo', 'Equipo']
```
Inside the `Sidebar` component body, before the `return`:

```tsx
  const { data: notifs } = useNotifications()
  const unread = (notifs ?? []).filter((n) => !n.read).length
```
In the `<nav>`, after the `{NAV.map(...)}` block and before the `{PLACEHOLDERS.map(...)}` block, add the Notificaciones link:

```tsx
        <Link href="/notifications" className="side-hover" style={itemStyle}>
          Notificaciones
          {unread > 0 && (
            <span data-testid="unread-badge"
              style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
              {unread}
            </span>
          )}
        </Link>
```
> `itemStyle` already sets `display: flex; alignItems: center`, so `marginLeft: 'auto'` pushes the badge to the right.

- [ ] **Step 5: Run the page + shell tests, then the full suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/notifications-page.test.tsx tests/shell.test.tsx
npx vitest run
npm run build
```
Expected: targeted tests pass; full suite passes; build compiles with the `/notifications` route emitted.

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add "app/(app)/notifications/page.tsx" tests/notifications-page.test.tsx components/Sidebar.tsx tests/shell.test.tsx
git commit -m "feat: notifications page and sidebar unread badge"
```

---

## Out of scope (this plan)

- Navegar a la tarea/proyecto desde la notificación; nombre del actor en el mensaje; agrupar/paginar;
  email; preferencias por tipo; tiempo real (websockets); notificar el comentario a todo el equipo.
- Backlog fast-follow heredado (`--text-muted`, formato de fechas, `enabled` de members/users, etc.).

## Self-Review

**Spec coverage:**
- `Notification` model + migración + servicio (create/list/mark/mark_all) → Task 1. ✅
- Tres disparadores con guarda "no te avises" (assigned/shared/comment) → Task 2. ✅
- Endpoints (GET, POST /{id}/read, POST /read-all, 404 ajena) + router registrado → Task 3. ✅
- Tipos + api (3) + hooks (3, poll 20s) → Task 4. ✅
- Página `/notifications` (lista, marcar una/todas, vacío) + sidebar link + badge de no-leídos → Task 5. ✅
- Destinatario-scoped, mensajes genéricos con título → Tasks 1–3. ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (modelo, servicio, migración `d0e2f4a6b8c1`←`c9d1e3f5a7b2`, 3 disparadores, router, tipos, api, hooks, página, sidebar). Las notas de "mockea useNotifications en los tests de Sidebar" son fidelidad de test, no placeholders. ✅

**Type consistency:** `create_notification(session, user_external_id, type, message, task_id=, project_id=)` (Task 1) usado por los 3 disparadores (Task 2). `list_notifications`/`mark_read`/`mark_all_read` (Task 1) usados por endpoints (Task 3). `Notification {id,type,message,task_id,project_id,read,created_at}` (Task 4) = serialización `_notification_dict` (Task 3), usado por api/hooks/página/tests. `listNotifications(token)`/`markNotificationRead(token,id)`/`markAllNotificationsRead(token)` coinciden api↔hooks↔tests. `useNotifications`→`['notifications']`; mark/mark-all invalidan la misma clave. data-testid `notification-item`/`unread-badge` y aria-label `marcar todas` consistentes página/sidebar↔tests. Link `/notifications` (Task 5) → la página existe (Task 5). Router `/api/notifications` (Task 3) ↔ `listNotifications` (Task 4). ✅
