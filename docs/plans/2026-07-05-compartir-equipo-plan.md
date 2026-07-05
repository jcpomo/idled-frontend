# Compartir proyectos con equipo (fundacional) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project owner can add/remove members; members collaborate on the project's tasks and comments; shared projects appear on their dashboard.

**Architecture:** A new `ProjectMember` table records membership. The centralized access checks gain `get_accessible_project`/`get_accessible_task` (owner OR member); the collaborative service callers (list/create/update/delete/move tasks, subtasks, comments, and `list_projects`) repoint to them, while owner-only ops (rename/delete project, member management) keep `get_owned_project`. New member-management + user-directory endpoints, and a frontend team panel + dashboard "shared" label.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Tasks 1–2 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 3–5 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **Two-tier permissions:** a **member** does everything on tasks/subtasks/comments; only the **owner** manages members and renames/deletes the project. Editing/deleting a comment stays **author-scoped**. No access → **404, never 403**.
- **Owner is NOT a `project_members` row** (it's `Project.user_external_id`); `list_members` returns the owner (first, `is_owner=True`) plus members.
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>` (conftest imports `app.gestor.models`, so `ProjectMember` registers). **Frontend tests run on the HOST:** `npx vitest run <path>`.
- Dark tokens (`var(--green)`/`var(--red)` exist; muted `#888`). TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).

---

## File Structure

**Backend (`idled-backend`):**
- `app/gestor/models.py` — `ProjectMember`.
- `migrations/versions/c9d1e3f5a7b2_project_members.py` — NEW migration (down_revision `b8c0d2e4f6a1`).
- `app/gestor/service.py` — `get_accessible_project`/`get_accessible_task`; repoint callers; `list_projects` OR-member; `list_members`/`add_member`/`remove_member`.
- `app/gestor/comments_service.py` — repoint to `get_accessible_task`.
- `app/auth/service.py` — `list_users`.
- `app/api/projects.py` — `is_owner` in list; 3 member endpoints.
- `app/api/users.py` — NEW router; `app/main.py` — register it.
- Tests: `tests/test_gestor_sharing.py` (new), `tests/test_projects_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/types.ts` — `Project.is_owner`, `UserDir`, `Member`.
- `lib/api.ts` — `listUsers`, `listMembers`, `addMember`, `removeMember`.
- `lib/queries.ts` — `useUsers`, `useMembers`, `useAddMember`, `useRemoveMember`.
- `components/kanban/TeamPanel.tsx` — NEW; mounted in `app/(app)/project/[id]/page.tsx`.
- `app/(app)/dashboard/page.tsx` — "compartido" label.
- Tests: `tests/member-queries.test.tsx` (new), `tests/team-panel.test.tsx` (new), `tests/dashboard.test.tsx`.

---

### Task 1: Backend — `ProjectMember` model, access functions, and caller repoint

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/models.py`, `app/gestor/service.py`, `app/gestor/comments_service.py`
- Create: `migrations/versions/c9d1e3f5a7b2_project_members.py`, `tests/test_gestor_sharing.py`

**Interfaces:**
- Produces:
  - `ProjectMember` model.
  - `get_accessible_project(session, project_id, user_external_id) -> Project | None` (owner OR member).
  - `get_accessible_task(session, task_id, user_external_id) -> Task | None`.
  - `list_projects` returns owned + shared.

- [ ] **Step 1: Write the failing service tests** — `tests/test_gestor_sharing.py`

```python
import pytest
from app.gestor.models import ProjectMember
from app.gestor.service import (
    create_project, create_task, list_tasks, list_projects, update_task,
    rename_project, delete_project, get_accessible_project,
)
from app.gestor.comments_service import create_comment

async def _member(session, project_id, ext):
    session.add(ProjectMember(project_id=project_id, user_external_id=ext))
    await session.commit()

@pytest.mark.asyncio
async def test_member_gets_access_non_member_does_not(session):
    p = await create_project(session, "owner", "P")
    t = await create_task(session, p.id, "owner", title="A")
    assert await get_accessible_project(session, p.id, "ext-2") is None
    assert await list_tasks(session, p.id, "ext-2") is None
    await _member(session, p.id, "ext-2")
    assert await get_accessible_project(session, p.id, "ext-2") is not None
    assert [x.title for x in await list_tasks(session, p.id, "ext-2")] == ["A"]
    # member can create + update tasks
    assert await create_task(session, p.id, "ext-2", title="B") is not None
    assert (await update_task(session, t.id, "ext-2", title="A2")).title == "A2"

@pytest.mark.asyncio
async def test_list_projects_includes_shared(session):
    p = await create_project(session, "owner", "P")
    await _member(session, p.id, "ext-2")
    assert p.id in [x.id for x in await list_projects(session, "ext-2")]
    # owner still sees it once
    assert [x.id for x in await list_projects(session, "owner")].count(p.id) == 1

@pytest.mark.asyncio
async def test_owner_only_ops_reject_member(session):
    p = await create_project(session, "owner", "P")
    await _member(session, p.id, "ext-2")
    assert await rename_project(session, p.id, "ext-2", "X") is None
    assert await delete_project(session, p.id, "ext-2") is False
    # owner can
    assert (await rename_project(session, p.id, "owner", "Y")).name == "Y"

@pytest.mark.asyncio
async def test_member_can_comment_non_member_cannot(session):
    p = await create_project(session, "owner", "P")
    t = await create_task(session, p.id, "owner", title="A")
    await _member(session, p.id, "ext-2")
    assert await create_comment(session, t.id, "ext-2", "Ana", "hola") is not None
    assert await create_comment(session, t.id, "ext-9", "X", "no") is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_gestor_sharing.py -v`
Expected: FAIL — `ProjectMember` / `get_accessible_project` do not exist; members have no access.

- [ ] **Step 3: Add the `ProjectMember` model** — `app/gestor/models.py`

Add `UniqueConstraint` to the sqlalchemy import and the model at the end of the file:

```python
from sqlalchemy import String, Integer, DateTime, Uuid, func, Text, ForeignKey, UniqueConstraint
```
```python
class ProjectMember(Base):
    __tablename__ = "project_members"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_external_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("project_id", "user_external_id", name="uq_project_member"),)
```

- [ ] **Step 4: Add access functions + repoint callers + list_projects** — `app/gestor/service.py`

Extend the imports (add `or_`, `exists`, and `ProjectMember`):

```python
from sqlalchemy import delete, func as safunc, select, or_, exists
from app.gestor.models import Project, Task, ProjectMember
```

Replace `list_projects` with the owned-or-member version:

```python
async def list_projects(session: AsyncSession, user_external_id: str) -> list[Project]:
    member = exists().where(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_external_id == user_external_id,
    )
    result = await session.execute(
        select(Project).where(
            or_(Project.user_external_id == user_external_id, member)
        ).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())
```

Add the two access functions (place them right after `get_owned_task`):

```python
async def get_accessible_project(
    session: AsyncSession, project_id: uuid.UUID, user_external_id: str
) -> Project | None:
    member = exists().where(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_external_id == user_external_id,
    )
    result = await session.execute(
        select(Project).where(
            Project.id == project_id,
            or_(Project.user_external_id == user_external_id, member),
        )
    )
    return result.scalar_one_or_none()


async def get_accessible_task(
    session: AsyncSession, task_id: uuid.UUID, user_external_id: str
) -> Task | None:
    member = exists().where(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_external_id == user_external_id,
    )
    result = await session.execute(
        select(Task).join(Project, Task.project_id == Project.id).where(
            Task.id == task_id,
            or_(Project.user_external_id == user_external_id, member),
        )
    )
    return result.scalar_one_or_none()
```

Now repoint the COLLABORATIVE callers (leave `rename_project`, `delete_project`, and `get_owned_project`/`get_owned_task` themselves untouched — the owner-only ops keep `get_owned_project`):
- In `create_task`: change `project = await get_owned_project(session, project_id, user_external_id)` → `project = await get_accessible_project(session, project_id, user_external_id)`.
- In `list_tasks`: change `project = await get_owned_project(...)` → `project = await get_accessible_project(...)`.
- In `create_subtask`: change `parent = await get_owned_task(...)` → `parent = await get_accessible_task(...)`.
- In `list_subtasks`: change `parent = await get_owned_task(...)` → `parent = await get_accessible_task(...)`.
- In `update_task`: change `task = await get_owned_task(...)` → `task = await get_accessible_task(...)`.
- In `delete_task`: change `task = await get_owned_task(...)` → `task = await get_accessible_task(...)`.
- In `move_task`: change `task = await get_owned_task(...)` → `task = await get_accessible_task(...)`.

- [ ] **Step 5: Repoint the comment services** — `app/gestor/comments_service.py`

Change the import and the two access calls (in `create_comment` and `list_comments`):

```python
from app.gestor.service import get_accessible_task
```
In `create_comment`: `task = await get_accessible_task(session, task_id, user_external_id)`.
In `list_comments`: `task = await get_accessible_task(session, task_id, user_external_id)`.
(Leave `_own_comment` / `update_comment` / `delete_comment` unchanged — they stay author-scoped.)

- [ ] **Step 6: Run the service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_gestor_sharing.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Guard against regressions in the existing gestor tests**

Run: `docker compose run --rm api pytest tests/test_gestor_tasks_service.py tests/test_gestor_subtasks.py tests/test_comments_service.py tests/test_gestor_projects_service.py -v`
Expected: PASS — existing owner-only tests still work (the owner is always accessible). If any fail, the repoint broke something — fix it, do not weaken the test.

- [ ] **Step 8: Create the Alembic migration** — `migrations/versions/c9d1e3f5a7b2_project_members.py`

```python
"""project members

Revision ID: c9d1e3f5a7b2
Revises: b8c0d2e4f6a1
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d1e3f5a7b2'
down_revision: Union[str, Sequence[str], None] = 'b8c0d2e4f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'project_members',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('user_external_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'user_external_id', name='uq_project_member'),
    )
    op.create_index(op.f('ix_project_members_project_id'), 'project_members', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_members_user_external_id'), 'project_members', ['user_external_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_project_members_user_external_id'), table_name='project_members')
    op.drop_index(op.f('ix_project_members_project_id'), table_name='project_members')
    op.drop_table('project_members')
```

Verify it applies (or is the new head):

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `b8c0d2e4f6a1 -> c9d1e3f5a7b2`. If no DB is reachable, run `docker compose run --rm api alembic history` and confirm `c9d1e3f5a7b2` is the head; note which you verified.

- [ ] **Step 9: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/gestor/models.py app/gestor/service.py app/gestor/comments_service.py migrations/versions/c9d1e3f5a7b2_project_members.py tests/test_gestor_sharing.py
git commit -m "feat: project membership model and owner-or-member access"
```

---

### Task 2: Backend — member services, user directory, and endpoints

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/service.py`, `app/auth/service.py`, `app/api/projects.py`, `app/main.py`
- Create: `app/api/users.py`
- Test: `tests/test_projects_endpoint.py`

**Interfaces:**
- Consumes: `get_accessible_project`, `get_owned_project`, `ProjectMember`, `User`.
- Produces:
  - `list_members(session, project_id, user_external_id) -> list[dict] | None` → `[{external_id, name, is_owner}]`, owner first.
  - `add_member(session, project_id, owner_external_id, member_external_id) -> bool` (owner-only, idempotent).
  - `remove_member(session, project_id, owner_external_id, member_external_id) -> bool` (owner-only).
  - `list_users(session) -> list[User]`.
  - Endpoints `GET/POST /api/projects/{id}/members`, `DELETE /api/projects/{id}/members/{external_id}`, `GET /api/users`; `is_owner` in `GET /api/projects`.

- [ ] **Step 1: Write the failing endpoint tests** — append to `tests/test_projects_endpoint.py`

(Reuse this file's `client` fixture and `_token`. If `_token` does not accept a `sub` argument, add a `sub="ext-7"` parameter to it — mirroring `tests/test_tasks_endpoint.py` — so a second user can be simulated.)

```python
@pytest.mark.asyncio
async def test_members_flow_and_is_owner(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token(sub='owner')}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        # is_owner true for the owner in the project list
        pl = (await ac.get("/api/projects", headers=h)).json()
        assert next(p for p in pl if p["id"] == pid)["is_owner"] is True
        # initially only the owner is a member
        m0 = (await ac.get(f"/api/projects/{pid}/members", headers=h)).json()
        assert [m["external_id"] for m in m0] == ["owner"] and m0[0]["is_owner"] is True
        # owner adds a member
        ra = await ac.post(f"/api/projects/{pid}/members", json={"external_id": "ext-2"}, headers=h)
        assert ra.status_code == 200
        assert set(m["external_id"] for m in ra.json()) == {"owner", "ext-2"}
        # the shared project shows for the member with is_owner false
        hm = {"Authorization": f"Bearer {_token(sub='ext-2')}"}
        pl2 = (await ac.get("/api/projects", headers=hm)).json()
        assert next(p for p in pl2 if p["id"] == pid)["is_owner"] is False
        # a non-owner cannot manage members
        assert (await ac.post(f"/api/projects/{pid}/members", json={"external_id": "ext-9"}, headers=hm)).status_code == 404
        # owner removes the member
        assert (await ac.delete(f"/api/projects/{pid}/members/ext-2", headers=h)).status_code == 200
        m1 = (await ac.get(f"/api/projects/{pid}/members", headers=h)).json()
        assert [m["external_id"] for m in m1] == ["owner"]

@pytest.mark.asyncio
async def test_users_directory(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token(sub='ext-7')}"}
        await ac.get("/api/projects", headers=h)  # ensures ext-7 is upserted
        r = await ac.get("/api/users", headers=h)
        assert r.status_code == 200
        assert any(u["external_id"] == "ext-7" for u in r.json())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_projects_endpoint.py -k "members_flow or users_directory" -v`
Expected: FAIL — endpoints missing / `is_owner` absent.

- [ ] **Step 3: Add the member services** — `app/gestor/service.py`

Add the `User` import and the three functions (append at the end of the file):

```python
from app.auth.models import User
```
```python
async def list_members(
    session: AsyncSession, project_id: uuid.UUID, user_external_id: str
) -> list[dict] | None:
    project = await get_accessible_project(session, project_id, user_external_id)
    if project is None:
        return None
    result = await session.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.created_at)
    )
    member_rows = list(result.scalars().all())
    ext_ids = [project.user_external_id] + [m.user_external_id for m in member_rows]
    users_res = await session.execute(select(User).where(User.external_id.in_(ext_ids)))
    names = {u.external_id: u.name for u in users_res.scalars().all()}
    out = [{"external_id": project.user_external_id, "name": names.get(project.user_external_id), "is_owner": True}]
    for m in member_rows:
        out.append({"external_id": m.user_external_id, "name": names.get(m.user_external_id), "is_owner": False})
    return out


async def add_member(
    session: AsyncSession, project_id: uuid.UUID, owner_external_id: str, member_external_id: str
) -> bool:
    project = await get_owned_project(session, project_id, owner_external_id)
    if project is None:
        return False
    if member_external_id == project.user_external_id:
        return True  # owner is implicitly a member; no-op
    existing = await session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_external_id == member_external_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        session.add(ProjectMember(project_id=project_id, user_external_id=member_external_id))
        await session.commit()
    return True


async def remove_member(
    session: AsyncSession, project_id: uuid.UUID, owner_external_id: str, member_external_id: str
) -> bool:
    project = await get_owned_project(session, project_id, owner_external_id)
    if project is None:
        return False
    await session.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_external_id == member_external_id,
        )
    )
    await session.commit()
    return True
```

- [ ] **Step 4: Add `list_users`** — `app/auth/service.py`

Append:

```python
async def list_users(session: AsyncSession) -> list[User]:
    result = await session.execute(select(User).order_by(User.name))
    return list(result.scalars().all())
```

- [ ] **Step 5: Add `is_owner` + member endpoints** — `app/api/projects.py`

Extend the service import and add the endpoints. Import:

```python
from app.gestor.service import (
    create_project, list_projects, rename_project, delete_project,
    create_task, list_tasks, list_members, add_member, remove_member,
)
```
Add a body model near `ProjectBody`:

```python
class MemberBody(BaseModel):
    external_id: str
```
In the `listar` handler (`GET /api/projects`), add `is_owner` to each dict:

```python
    return [{"id": str(p.id), "name": p.name,
             "created_at": p.created_at.isoformat() if p.created_at else None,
             "is_owner": p.user_external_id == user.external_id}
            for p in projects]
```
Add the three endpoints (after `listar_tareas`):

```python
@router.get("/{project_id}/members")
async def listar_miembros(project_id: uuid.UUID, user: User = Depends(get_current_user),
                          session: AsyncSession = Depends(get_session)) -> list[dict]:
    ms = await list_members(session, project_id, user.external_id)
    if ms is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return ms

@router.post("/{project_id}/members")
async def anadir_miembro(project_id: uuid.UUID, body: MemberBody,
                         user: User = Depends(get_current_user),
                         session: AsyncSession = Depends(get_session)) -> list[dict]:
    ok = await add_member(session, project_id, user.external_id, body.external_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return await list_members(session, project_id, user.external_id)

@router.delete("/{project_id}/members/{member_external_id}")
async def quitar_miembro(project_id: uuid.UUID, member_external_id: str,
                         user: User = Depends(get_current_user),
                         session: AsyncSession = Depends(get_session)) -> dict:
    ok = await remove_member(session, project_id, user.external_id, member_external_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"deleted": True}
```

- [ ] **Step 6: Create the users router** — `app/api/users.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.service import list_users
from app.core.db import get_session

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def listar(user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> list[dict]:
    users = await list_users(session)
    return [{"external_id": u.external_id, "name": u.name} for u in users]
```

- [ ] **Step 7: Register the users router** — `app/main.py`

```python
from app.api import chat, documentos, erp, projects, tasks, comments, users
```
```python
app.include_router(comments.router)
app.include_router(users.router)
```

- [ ] **Step 8: Run the endpoint tests, then the full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_projects_endpoint.py -v
docker compose run --rm api pytest -q
```
Expected: the new tests pass; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 9: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/gestor/service.py app/auth/service.py app/api/projects.py app/api/users.py app/main.py tests/test_projects_endpoint.py
git commit -m "feat: member management + user directory endpoints, is_owner in project list"
```

---

### Task 3: Frontend — member/user types, api, and hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`
- Test: `tests/member-queries.test.tsx` (create)

**Interfaces:**
- Produces:
  - `Project.is_owner?: boolean`; `UserDir { external_id; name: string | null }`; `Member { external_id; name: string | null; is_owner: boolean }`.
  - `listUsers(token)`, `listMembers(token, projectId)`, `addMember(token, projectId, externalId)`, `removeMember(token, projectId, externalId)`.
  - `useUsers()` → `['users']`; `useMembers(projectId)` → `['members', projectId]`; `useAddMember(projectId)` mutate `externalId`; `useRemoveMember(projectId)` mutate `externalId`.

- [ ] **Step 1: Write the failing test** — `tests/member-queries.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useUsers, useMembers, useAddMember, useRemoveMember } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useUsers loads the directory with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listUsers').mockResolvedValue([] as never)
  const { result } = renderHook(() => useUsers(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMembers loads a project team with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listMembers').mockResolvedValue([] as never)
  const { result } = renderHook(() => useMembers('p1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 'p1')
})

it('useAddMember posts a member with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'addMember').mockResolvedValue([] as never)
  const { result } = renderHook(() => useAddMember('p1'), { wrapper: wrapper() })
  result.current.mutate('ext-2')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1', 'ext-2'))
})

it('useRemoveMember deletes a member with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'removeMember').mockResolvedValue({ deleted: true })
  const { result } = renderHook(() => useRemoveMember('p1'), { wrapper: wrapper() })
  result.current.mutate('ext-2')
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1', 'ext-2'))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/member-queries.test.tsx`
Expected: FAIL — hooks / api functions not exported.

- [ ] **Step 3: Add the types** — `lib/types.ts`

Change `Project` and add the two interfaces:

```ts
export interface Project {
  id: string
  name: string
  created_at?: string | null
  is_owner?: boolean
}

export interface UserDir {
  external_id: string
  name: string | null
}

export interface Member {
  external_id: string
  name: string | null
  is_owner: boolean
}
```

- [ ] **Step 4: Add the api functions** — `lib/api.ts`

Extend the type import and append:

```ts
import type { Project, Task, TaskStatus, TaskComment, Conversation, ChatMessage, DocumentItem, UserDir, Member } from '@/lib/types'
```
```ts
export const listUsers = (token: string) =>
  apiFetch<UserDir[]>('/api/users', { token })

export const listMembers = (token: string, projectId: string) =>
  apiFetch<Member[]>(`/api/projects/${projectId}/members`, { token })

export const addMember = (token: string, projectId: string, externalId: string) =>
  apiFetch<Member[]>(`/api/projects/${projectId}/members`, { method: 'POST', body: { external_id: externalId }, token })

export const removeMember = (token: string, projectId: string, externalId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/members/${externalId}`, { method: 'DELETE', token })
```

- [ ] **Step 5: Add the hooks** — `lib/queries.ts`

Append:

```ts
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(token()),
    enabled: Boolean(getToken()),
  })
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.listMembers(token(), projectId),
    enabled: Boolean(projectId) && Boolean(getToken()),
  })
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (externalId: string) => api.addMember(token(), projectId, externalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (externalId: string) => api.removeMember(token(), projectId, externalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/member-queries.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts tests/member-queries.test.tsx
git commit -m "feat: member/user types, api, and query hooks"
```

---

### Task 4: Frontend — `TeamPanel` + mount in the project page

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `components/kanban/TeamPanel.tsx`, `tests/team-panel.test.tsx`
- Modify: `app/(app)/project/[id]/page.tsx`

**Interfaces:**
- Consumes: `useProjects`, `useMembers`, `useUsers`, `useAddMember`, `useRemoveMember`.
- Produces: `TeamPanel({ projectId })` (default export), mounted above the board.

- [ ] **Step 1: Write the failing test** — `tests/team-panel.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Member, UserDir, Project } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const members: Member[] = [
  { external_id: 'owner', name: 'Dueño', is_owner: true },
  { external_id: 'ext-2', name: 'Bea', is_owner: false },
]
const users: UserDir[] = [
  { external_id: 'owner', name: 'Dueño' },
  { external_id: 'ext-2', name: 'Bea' },
  { external_id: 'ext-3', name: 'Carla' },
]

function stub(isOwner: boolean) {
  const addMut = vi.fn(); const removeMut = vi.fn()
  const project: Project = { id: 'p1', name: 'P', is_owner: isOwner }
  vi.spyOn(queries, 'useProjects').mockReturnValue({ data: [project] } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: members } as never)
  vi.spyOn(queries, 'useUsers').mockReturnValue({ data: users } as never)
  vi.spyOn(queries, 'useAddMember').mockReturnValue({ mutate: addMut } as never)
  vi.spyOn(queries, 'useRemoveMember').mockReturnValue({ mutate: removeMut } as never)
  return { addMut, removeMut }
}

it('lists the team with the owner marked', async () => {
  stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  expect(screen.getAllByTestId('team-member')).toHaveLength(2)
  expect(screen.getByText(/Dueño/)).toHaveTextContent('(dueño)')
})

it('owner can add a member (directory excludes existing members)', async () => {
  const { addMut } = stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  const select = screen.getByLabelText('añadir miembro') as HTMLSelectElement
  // Carla (ext-3) is addable; owner + ext-2 are already members and excluded
  expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'ext-3'])
  fireEvent.change(select, { target: { value: 'ext-3' } })
  fireEvent.click(screen.getByLabelText('confirmar añadir'))
  expect(addMut).toHaveBeenCalledWith('ext-3')
})

it('owner can remove a non-owner member', async () => {
  const { removeMut } = stub(true)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  fireEvent.click(screen.getByLabelText('quitar ext-2'))
  expect(removeMut).toHaveBeenCalledWith('ext-2')
})

it('a non-owner sees the team but no management controls', async () => {
  stub(false)
  const { default: TeamPanel } = await import('@/components/kanban/TeamPanel')
  render(<TeamPanel projectId="p1" />)
  expect(screen.getAllByTestId('team-member')).toHaveLength(2)
  expect(screen.queryByLabelText('añadir miembro')).toBeNull()
  expect(screen.queryByLabelText('quitar ext-2')).toBeNull()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/team-panel.test.tsx`
Expected: FAIL — cannot resolve `@/components/kanban/TeamPanel`.

- [ ] **Step 3: Create `components/kanban/TeamPanel.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useProjects, useMembers, useUsers, useAddMember, useRemoveMember } from '@/lib/queries'

const chip = {
  fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 8px',
} as const

export default function TeamPanel({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects()
  const { data: members } = useMembers(projectId)
  const { data: users } = useUsers()
  const add = useAddMember(projectId)
  const remove = useRemoveMember(projectId)
  const [pick, setPick] = useState('')

  const isOwner = (projects ?? []).find((p) => p.id === projectId)?.is_owner === true
  const memberIds = new Set((members ?? []).map((m) => m.external_id))
  const addable = (users ?? []).filter((u) => !memberIds.has(u.external_id))

  return (
    <div style={{ padding: 12, borderBottom: '1px solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#888' }}>Equipo:</span>
      {(members ?? []).map((m) => (
        <span key={m.external_id} data-testid="team-member" style={chip}>
          {(m.name ?? m.external_id) + (m.is_owner ? ' (dueño)' : '')}
          {isOwner && !m.is_owner && (
            <button aria-label={`quitar ${m.external_id}`} onClick={() => remove.mutate(m.external_id)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0 }}>×</button>
          )}
        </span>
      ))}
      {isOwner && (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <select aria-label="añadir miembro" value={pick} onChange={(e) => setPick(e.target.value)}
            style={{ fontSize: 12, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: 4 }}>
            <option value="">+ miembro…</option>
            {addable.map((u) => <option key={u.external_id} value={u.external_id}>{u.name ?? u.external_id}</option>)}
          </select>
          <button aria-label="confirmar añadir" onClick={() => { if (pick) { add.mutate(pick); setPick('') } }}
            style={{ fontSize: 12, background: 'var(--bg-5)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '4px 8px' }}>Añadir</button>
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/team-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Mount the panel above the board** — `app/(app)/project/[id]/page.tsx`

Replace the whole file:

```tsx
import Board from '@/components/kanban/Board'
import TeamPanel from '@/components/kanban/TeamPanel'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TeamPanel projectId={params.id} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Board projectId={params.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the full suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run
npm run build
```
Expected: full suite passes; build compiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add components/kanban/TeamPanel.tsx tests/team-panel.test.tsx "app/(app)/project/[id]/page.tsx"
git commit -m "feat: team panel with member management on the project page"
```

---

### Task 5: Frontend — dashboard "shared" label

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: `Project.is_owner`.

- [ ] **Step 1: Write the failing test** — append to `tests/dashboard.test.tsx`

```tsx
it('labels shared projects (is_owner false)', async () => {
  vi.spyOn(queries, 'useProjects').mockReturnValue({
    data: [
      { id: 'p1', name: 'Mío' },
      { id: 'p2', name: 'Ajeno', is_owner: false },
    ],
    isLoading: false,
  } as never)
  vi.spyOn(queries, 'useCreateProject').mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  const { default: Dashboard } = await import('@/app/(app)/dashboard/page')
  wrap(<Dashboard />)
  expect(await screen.findByText('Ajeno')).toBeInTheDocument()
  expect(screen.getByText('compartido')).toBeInTheDocument()
})
```
> Use the render helper this file already uses (it wraps `<Dashboard />` in a `QueryClientProvider`). If the existing tests call `wrap(<Dashboard/>)`, match that; if they call a plain `render(...)` inside a provider, mirror it. Reuse the file's existing imports (`vi`, `screen`, `* as queries`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/dashboard.test.tsx`
Expected: FAIL — no "compartido" label rendered.

- [ ] **Step 3: Add the label** — `app/(app)/dashboard/page.tsx`

Change the project card `<Link>` body to include the label when the project is shared:

```tsx
            <Link key={p.id} href={`/project/${p.id}`}
              style={{ display: 'block', padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', textDecoration: 'none' }}>
              {p.name}
              {p.is_owner === false && (
                <span style={{ marginLeft: 8, fontSize: 10, color: '#888' }}>compartido</span>
              )}
            </Link>
```

- [ ] **Step 4: Run the test, the full suite, and the build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/dashboard.test.tsx
npx vitest run
npm run build
```
Expected: all pass; build compiles.

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add "app/(app)/dashboard/page.tsx" tests/dashboard.test.tsx
git commit -m "feat: mark shared projects on the dashboard"
```

---

## Out of scope (this plan)

- Asignar tareas a un miembro real (selector; `assignee` sigue texto libre).
- Roles viewer/editor por miembro; avatares/presencia; notificaciones de compartición.
- "Abandonar proyecto" por el miembro; invitar por email a usuarios inexistentes.
- Extender el smoke Playwright para compartir.
- Backlog fast-follow heredado (`--text-muted`, formato de fechas, etc.).

## Self-Review

**Spec coverage:**
- `ProjectMember` + migración → Task 1. ✅
- `get_accessible_project`/`get_accessible_task` + repoint de callers colaborativos + comentarios; owner-only intacto; `list_projects` compartidos → Task 1. ✅
- `list_members`/`add_member`/`remove_member`, `list_users`, endpoints (members CRUD, users, `is_owner`) → Task 2. ✅
- Tipos (`is_owner`/UserDir/Member) + api (4) + hooks (4) → Task 3. ✅
- TeamPanel (equipo, añadir del directorio excluyendo miembros, quitar; controles solo dueño vía `is_owner`) + montaje → Task 4. ✅
- Dashboard etiqueta "compartido" (is_owner===false) → Task 5. ✅
- 404-no-403 en gestión; edición de comentario author-scoped intacta → Task 1/2 tests. ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (modelo, migración `c9d1e3f5a7b2`←`b8c0d2e4f6a1`, acceso, servicios, endpoints, router, tipos, api, hooks, panel, dashboard). Las notas de "usa el helper de render de ese fichero" (Task 5) son instrucciones de estilo de test, no placeholders de código. ✅

**Type consistency:** `get_accessible_project`/`get_accessible_task` (Task 1) usados por callers y comments (Task 1). `list_members` → `[{external_id,name,is_owner}]` (Task 2) = `Member` (Task 3) usado por api/hooks/TeamPanel/tests. `add_member/remove_member(session,pid,owner,member)` (Task 2) tras endpoints. `addMember(token,pid,externalId)`/`removeMember(...)` (Task 3) coinciden api↔hooks↔TeamPanel↔tests. `useAddMember`/`useRemoveMember` mutate `externalId:string`. `useUsers`→`['users']`, `useMembers`→`['members',pid]`. `Project.is_owner?:boolean` (Task 3) usado por TeamPanel (Task 4) y dashboard (Task 5). aria-labels `añadir miembro`/`confirmar añadir`/`quitar <id>` y data-testid `team-member` consistentes TeamPanel↔test. Endpoint `GET /api/users` (Task 2) ↔ `listUsers` (Task 3). ✅
