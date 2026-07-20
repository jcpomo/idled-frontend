# Marco Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir el chrome global del diseño IMASD — topbar (breadcrumb + "Nueva tarea" + campana + buscador global ⌘K) y sidebar en gris `#565656` con ficha de usuario y sección PROYECTOS colapsable con color + contador — todo full-stack.

**Architecture:** El backend (FastAPI/SQLAlchemy async) gana una columna `color` en `projects`, enriquece `GET /api/projects` con `color`+`task_count`, y expone `GET /api/search`. El frontend (Next.js 14 App Router) añade un `Topbar` al layout del grupo `(app)`, reforma `Sidebar`, y añade búsqueda vía React Query. La identidad de usuario se lee decodificando el JWT en cliente (sin endpoint nuevo).

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, pytest+httpx. Frontend: Next.js 14, React 18, TypeScript, @tanstack/react-query, Vitest + Testing Library.

## Global Constraints

- Backend repo: `/Users/pomo/Documents/App/Bruno/idled-backend`. Frontend repo: `/Users/pomo/Documents/App/Bruno/idled-frontend` (rama `feature/marco-global`).
- Paleta de colores de proyecto (orden exacto): `#FAC51C, #FF7F24, #46C26A, #4FB6E8, #E5484D, #C9A227, #A9A9A9`.
- Acento primario `#FAC51C`; sidebar `#565656`; fondo app `#080808`; texto `#F5F5F5`. Tipografías Outfit / JetBrains Mono (`.mono`).
- `task_count` = tareas de nivel superior del proyecto (`parent_id IS NULL`).
- Ámbito de datos: siempre el del usuario autenticado (proyectos propios o donde es miembro), usando los helpers existentes `list_projects` / `get_accessible_project`.
- Backend tests: `pytest` desde `idled-backend` (o `docker compose exec -T api pytest`). Frontend tests: `npm test` (vitest) desde `idled-frontend`.
- UI en español. Sin librerías UI nuevas; estilos inline con variables CSS existentes.

---

## Backend

### Task 1: Columna `color` en `projects` (modelo + migración)

**Files:**
- Modify: `idled-backend/app/gestor/models.py` (clase `Project`)
- Create: `idled-backend/migrations/versions/c1a2b3d4e5f6_project_color.py`
- Test: `idled-backend/tests/test_project_color_migration.py`

**Interfaces:**
- Produces: `Project.color: Mapped[str]` (columna `color`, String, NOT NULL, default `#FAC51C`).

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_project_color_migration.py
import pytest
from sqlalchemy import select
from app.gestor.models import Project

@pytest.mark.asyncio
async def test_project_has_color_column_with_default(session):
    p = Project(user_external_id="ext-1", name="Serie X")
    session.add(p)
    await session.commit()
    await session.refresh(p)
    assert p.color == "#FAC51C"
```

- [ ] **Step 2: Ejecutar el test y ver que falla**

Run: `cd idled-backend && pytest tests/test_project_color_migration.py -v`
Expected: FAIL (`AttributeError: 'Project' object has no attribute 'color'` o columna inexistente).

- [ ] **Step 3: Añadir la columna al modelo**

En `app/gestor/models.py`, dentro de `class Project`, tras la línea `name: Mapped[str] = mapped_column(String)` añadir:

```python
    color: Mapped[str] = mapped_column(String, nullable=False, server_default="#FAC51C")
```

- [ ] **Step 4: Crear la migración Alembic**

Crear `migrations/versions/c1a2b3d4e5f6_project_color.py` (down_revision = head actual `b2d4f6a8c0e2`):

```python
"""project color

Revision ID: c1a2b3d4e5f6
Revises: b2d4f6a8c0e2
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'b2d4f6a8c0e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('color', sa.String(), nullable=False, server_default='#FAC51C'))


def downgrade() -> None:
    op.drop_column('projects', 'color')
```

- [ ] **Step 5: Aplicar la migración y correr el test**

Run:
```bash
cd idled-backend && docker compose exec -T api alembic upgrade head
pytest tests/test_project_color_migration.py -v
```
Expected: migración `c1a2b3d4e5f6` aplicada; test PASS.

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/models.py migrations/versions/c1a2b3d4e5f6_project_color.py tests/test_project_color_migration.py
git commit -m "feat(gestor): add color column to projects"
```

---

### Task 2: Asignación de color en creación + `PATCH` de color

**Files:**
- Modify: `idled-backend/app/gestor/service.py` (`create_project`; nueva `set_project_color`)
- Modify: `idled-backend/app/api/projects.py` (`create`, `ProjectBody`, `rename`→acepta color)
- Test: `idled-backend/tests/test_project_color_service.py`

**Interfaces:**
- Consumes: `Project.color` (Task 1).
- Produces:
  - `create_project(session, user_external_id, name, color: str | None = None) -> Project` — si `color` es None, asigna rotando la paleta según nº de proyectos del usuario.
  - `set_project_color(session, project_id, user_external_id, color: str) -> Project | None`
  - Constante `PROJECT_COLORS: list[str]` en `service.py`.
  - `POST /api/projects` acepta `{name, color?}`; `PATCH /api/projects/{id}` acepta `{name?, color?}`.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_project_color_service.py
import pytest
from app.gestor.service import create_project, set_project_color, PROJECT_COLORS

@pytest.mark.asyncio
async def test_auto_color_rotates_and_patch(session):
    p1 = await create_project(session, "ext-1", "Uno")
    p2 = await create_project(session, "ext-1", "Dos")
    assert p1.color == PROJECT_COLORS[0]
    assert p2.color == PROJECT_COLORS[1]
    updated = await set_project_color(session, p1.id, "ext-1", "#46C26A")
    assert updated is not None and updated.color == "#46C26A"

@pytest.mark.asyncio
async def test_explicit_color_on_create(session):
    p = await create_project(session, "ext-1", "Tres", color="#4FB6E8")
    assert p.color == "#4FB6E8"
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && pytest tests/test_project_color_service.py -v`
Expected: FAIL (`ImportError` de `PROJECT_COLORS`/`set_project_color`, o firma de `create_project` sin `color`).

- [ ] **Step 3: Implementar en `service.py`**

Cerca de los imports añadir la constante:

```python
PROJECT_COLORS: list[str] = ["#FAC51C", "#FF7F24", "#46C26A", "#4FB6E8", "#E5484D", "#C9A227", "#A9A9A9"]
```

Reemplazar `create_project` por:

```python
async def create_project(
    session: AsyncSession, user_external_id: str, name: str, color: str | None = None
) -> Project:
    if color is None:
        result = await session.execute(
            select(safunc.count(Project.id)).where(Project.user_external_id == user_external_id)
        )
        n = result.scalar() or 0
        color = PROJECT_COLORS[n % len(PROJECT_COLORS)]
    project = Project(user_external_id=user_external_id, name=name, color=color)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project
```

Añadir tras `rename_project`:

```python
async def set_project_color(
    session: AsyncSession, project_id: uuid.UUID, user_external_id: str, color: str
) -> Project | None:
    project = await get_owned_project(session, project_id, user_external_id)
    if project is None:
        return None
    project.color = color
    await session.commit()
    await session.refresh(project)
    return project
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-backend && pytest tests/test_project_color_service.py -v`
Expected: PASS.

- [ ] **Step 5: Cablear la API**

En `app/api/projects.py`:

`ProjectBody` pasa a:
```python
class ProjectBody(BaseModel):
    name: str
    color: str | None = None
```

Nuevo body para patch (añadir junto a `ProjectBody`):
```python
class ProjectPatchBody(BaseModel):
    name: str | None = None
    color: str | None = None
```

`create` usa el color:
```python
@router.post("")
async def create(body: ProjectBody, user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> dict:
    p = await create_project(session, user.external_id, body.name, color=body.color)
    return {"id": str(p.id), "name": p.name, "color": p.color}
```

`rename` pasa a aceptar color parcial (importar `set_project_color`):
```python
@router.patch("/{project_id}")
async def rename(project_id: uuid.UUID, body: ProjectPatchBody,
                 user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> dict:
    p = None
    if body.name is not None:
        p = await rename_project(session, project_id, user.external_id, body.name)
    if body.color is not None:
        p = await set_project_color(session, project_id, user.external_id, body.color)
    if p is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return {"id": str(p.id), "name": p.name, "color": p.color}
```
Añadir `set_project_color` al import desde `app.gestor.service`.

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/service.py app/api/projects.py tests/test_project_color_service.py
git commit -m "feat(gestor): auto-assign project color + PATCH color"
```

---

### Task 3: `GET /api/projects` con `color` y `task_count`

**Files:**
- Modify: `idled-backend/app/gestor/service.py` (nueva `list_projects_with_counts`)
- Modify: `idled-backend/app/api/projects.py` (`listar`)
- Test: `idled-backend/tests/test_projects_list_counts.py`

**Interfaces:**
- Consumes: `list_projects`, `Project.color` (Tasks 1–2).
- Produces: `list_projects_with_counts(session, user_external_id) -> list[tuple[Project, int]]` — cada proyecto con su conteo de tareas top-level. `GET /api/projects` devuelve `color` y `task_count` por item.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_projects_list_counts.py
import jwt as pyjwt
import pytest
import httpx
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"

def _token(sub="ext-9", role="administracion"):
    return pyjwt.encode({"sub": sub, "role": role, "name": "Q"}, SECRET, algorithm="HS256")

@pytest.fixture
def client(session, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    from app.core.config import get_settings
    get_settings.cache_clear()
    from app.main import app
    async def _override_session():
        yield session
    app.dependency_overrides[get_session] = _override_session
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_projects_list_includes_color_and_count(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "Serie X"}, headers=h)).json()["id"]
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "T1"}, headers=h)
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "T2"}, headers=h)
        lst = (await ac.get("/api/projects", headers=h)).json()
        row = next(p for p in lst if p["id"] == pid)
        assert row["color"].startswith("#")
        assert row["task_count"] == 2
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && pytest tests/test_projects_list_counts.py -v`
Expected: FAIL (`KeyError: 'task_count'`).

- [ ] **Step 3: Implementar la agregación en `service.py`**

Añadir tras `list_projects`:

```python
async def list_projects_with_counts(
    session: AsyncSession, user_external_id: str
) -> list[tuple[Project, int]]:
    projects = await list_projects(session, user_external_id)
    if not projects:
        return []
    ids = [p.id for p in projects]
    result = await session.execute(
        select(Task.project_id, safunc.count(Task.id))
        .where(Task.project_id.in_(ids), Task.parent_id.is_(None))
        .group_by(Task.project_id)
    )
    counts = {pid: c for pid, c in result.all()}
    return [(p, counts.get(p.id, 0)) for p in projects]
```

- [ ] **Step 4: Actualizar el endpoint `listar`**

En `app/api/projects.py`, importar `list_projects_with_counts` y reemplazar `listar`:

```python
@router.get("")
async def listar(user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = await list_projects_with_counts(session, user.external_id)
    return [{"id": str(p.id), "name": p.name, "color": p.color,
             "task_count": count,
             "created_at": p.created_at.isoformat() if p.created_at else None,
             "is_owner": p.user_external_id == user.external_id}
            for p, count in rows]
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd idled-backend && pytest tests/test_projects_list_counts.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/service.py app/api/projects.py tests/test_projects_list_counts.py
git commit -m "feat(gestor): projects list returns color and task_count"
```

---

### Task 4: `GET /api/search` (proyectos + tareas por título)

**Files:**
- Create: `idled-backend/app/api/search.py`
- Modify: `idled-backend/app/main.py` (registrar router)
- Modify: `idled-backend/app/gestor/service.py` (nueva `search_projects_and_tasks`)
- Test: `idled-backend/tests/test_search_endpoint.py`

**Interfaces:**
- Consumes: helpers de ámbito (`list_projects`, joins con `Project`).
- Produces:
  - `search_projects_and_tasks(session, user_external_id, q: str) -> dict` con claves `projects` y `tasks`.
  - `GET /api/search?q=` → `{"projects": [{id,name,color}], "tasks": [{id,title,project_id,project_name,status}]}`. `q` con menos de 2 chars (tras strip) → listas vacías sin consultar.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_search_endpoint.py
import jwt as pyjwt
import pytest
import httpx
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"

def _token(sub, role="administracion"):
    return pyjwt.encode({"sub": sub, "role": role, "name": "Q"}, SECRET, algorithm="HS256")

@pytest.fixture
def client(session, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    from app.core.config import get_settings
    get_settings.cache_clear()
    from app.main import app
    async def _override_session():
        yield session
    app.dependency_overrides[get_session] = _override_session
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_search_finds_own_projects_and_tasks(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token('ext-a')}"}
        pid = (await ac.post("/api/projects", json={"name": "Serie X"}, headers=h)).json()["id"]
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "Render frontal"}, headers=h)
        res = (await ac.get("/api/search", params={"q": "serie"}, headers=h)).json()
        assert any(p["name"] == "Serie X" for p in res["projects"])
        res2 = (await ac.get("/api/search", params={"q": "render"}, headers=h)).json()
        assert any(t["title"] == "Render frontal" and t["project_name"] == "Serie X" for t in res2["tasks"])

@pytest.mark.asyncio
async def test_search_scoped_and_short_query(client):
    async with client as ac:
        ha = {"Authorization": f"Bearer {_token('ext-a')}"}
        hb = {"Authorization": f"Bearer {_token('ext-b')}"}
        await ac.post("/api/projects", json={"name": "Secreto A"}, headers=ha)
        # ext-b no ve el proyecto de ext-a
        res_b = (await ac.get("/api/search", params={"q": "secreto"}, headers=hb)).json()
        assert res_b["projects"] == []
        # query corta → vacío
        res_short = (await ac.get("/api/search", params={"q": "s"}, headers=ha)).json()
        assert res_short == {"projects": [], "tasks": []}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && pytest tests/test_search_endpoint.py -v`
Expected: FAIL (404, no existe `/api/search`).

- [ ] **Step 3: Implementar `search_projects_and_tasks` en `service.py`**

```python
async def search_projects_and_tasks(
    session: AsyncSession, user_external_id: str, q: str
) -> dict:
    q = (q or "").strip()
    if len(q) < 2:
        return {"projects": [], "tasks": []}
    projects = await list_projects(session, user_external_id)
    scoped_ids = [p.id for p in projects]
    like = f"%{q}%"
    proj_matches = [
        {"id": str(p.id), "name": p.name, "color": p.color}
        for p in projects if q.lower() in p.name.lower()
    ][:8]
    task_rows = []
    if scoped_ids:
        result = await session.execute(
            select(Task, Project.name)
            .join(Project, Task.project_id == Project.id)
            .where(Task.project_id.in_(scoped_ids), Task.title.ilike(like))
            .order_by(Task.created_at.desc())
            .limit(15)
        )
        task_rows = [
            {"id": str(t.id), "title": t.title, "project_id": str(t.project_id),
             "project_name": pname, "status": t.status}
            for t, pname in result.all()
        ]
    return {"projects": proj_matches, "tasks": task_rows}
```

- [ ] **Step 4: Crear el router `app/api/search.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.db import get_session
from app.gestor.service import search_projects_and_tasks

router = APIRouter(prefix="/api/search", tags=["search"])

@router.get("")
async def search(q: str = "", user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> dict:
    return await search_projects_and_tasks(session, user.external_id, q)
```

- [ ] **Step 5: Registrar el router en `main.py`**

En `app/main.py`: añadir `search` al import de `app.api` (línea 6) y `app.include_router(search.router)` junto a los demás `include_router`.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cd idled-backend && pytest tests/test_search_endpoint.py -v`
Expected: PASS (ambos tests).

- [ ] **Step 7: Commit**

```bash
cd idled-backend && git add app/api/search.py app/main.py app/gestor/service.py tests/test_search_endpoint.py
git commit -m "feat(search): global search endpoint for projects and tasks"
```

---

## Frontend

### Task 5: `decodeToken()` + tipos de Project enriquecidos

**Files:**
- Modify: `idled-frontend/lib/auth.ts` (nueva `decodeToken`)
- Modify: `idled-frontend/lib/types.ts` (`Project`, nuevos tipos de búsqueda)
- Test: `idled-frontend/tests/decode-token.test.ts`

**Interfaces:**
- Produces:
  - `decodeToken(token: string | null): { sub: string; name: string | null; role: string | null } | null`
  - `Project` gana `color?: string` y `task_count?: number`.
  - Nuevos: `SearchResult { projects: SearchProject[]; tasks: SearchTask[] }`, `SearchProject { id; name; color }`, `SearchTask { id; title; project_id; project_name; status }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// idled-frontend/tests/decode-token.test.ts
import { describe, it, expect } from 'vitest'
import { decodeToken } from '@/lib/auth'

// header.payload.signature — payload base64url de {sub,name,role}
function makeToken(payload: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('decodeToken', () => {
  it('extrae sub, name y role', () => {
    const t = makeToken({ sub: 'ana@idled.test', name: 'Ana Admin', role: 'administracion' })
    expect(decodeToken(t)).toEqual({ sub: 'ana@idled.test', name: 'Ana Admin', role: 'administracion' })
  })
  it('devuelve null con token nulo o corrupto', () => {
    expect(decodeToken(null)).toBeNull()
    expect(decodeToken('no-es-un-jwt')).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- decode-token`
Expected: FAIL (`decodeToken` no existe).

- [ ] **Step 3: Implementar `decodeToken` en `lib/auth.ts`**

Añadir al final de `lib/auth.ts`:

```ts
export interface TokenPayload {
  sub: string
  name: string | null
  role: string | null
}

export function decodeToken(token: string | null): TokenPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary')
    const payload = JSON.parse(decodeURIComponent(escape(json))) as Record<string, unknown>
    if (typeof payload.sub !== 'string') return null
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      role: typeof payload.role === 'string' ? payload.role : null,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Extender los tipos en `lib/types.ts`**

Reemplazar la interfaz `Project` por:

```ts
export interface Project {
  id: string
  name: string
  color?: string
  task_count?: number
  created_at?: string | null
  is_owner?: boolean
}
```

Añadir al final del archivo:

```ts
export interface SearchProject {
  id: string
  name: string
  color: string
}

export interface SearchTask {
  id: string
  title: string
  project_id: string
  project_name: string
  status: string
}

export interface SearchResult {
  projects: SearchProject[]
  tasks: SearchTask[]
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- decode-token`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd idled-frontend && git add lib/auth.ts lib/types.ts tests/decode-token.test.ts
git commit -m "feat: decodeToken helper and enriched Project/search types"
```

---

### Task 6: `searchAll` API + `useSearch` hook

**Files:**
- Modify: `idled-frontend/lib/api.ts` (nueva `searchAll`)
- Modify: `idled-frontend/lib/queries.ts` (nueva `useSearch`)
- Test: `idled-frontend/tests/use-search.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `SearchResult` (Task 5), `getToken`.
- Produces:
  - `searchAll(token: string, q: string): Promise<SearchResult>` → `GET /api/search?q=...`
  - `useSearch(q: string)` — React Query; `enabled` sólo si hay token y `q.trim().length >= 2`; devuelve `SearchResult`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/use-search.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSearch } from '@/lib/queries'

beforeEach(() => {
  localStorage.setItem('idled_token', 'header.payload.sig')
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSearch', () => {
  it('no consulta con query corta', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const { result } = renderHook(() => useSearch('s'), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('devuelve resultados con query válida', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [{ id: '1', name: 'Serie X', color: '#FAC51C' }], tasks: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const { result } = renderHook(() => useSearch('serie'), { wrapper })
    await waitFor(() => expect(result.current.data?.projects[0].name).toBe('Serie X'))
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- use-search`
Expected: FAIL (`useSearch` no existe).

- [ ] **Step 3: Implementar `searchAll` en `lib/api.ts`**

Añadir `SearchResult` al import de tipos (arriba del archivo) y añadir la función junto a las demás:

```ts
export const searchAll = (token: string, q: string) =>
  apiFetch<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`, { token })
```

- [ ] **Step 4: Implementar `useSearch` en `lib/queries.ts`**

Añadir al final:

```ts
export function useSearch(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => api.searchAll(token(), trimmed),
    enabled: Boolean(getToken()) && trimmed.length >= 2,
    staleTime: 10000,
  })
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- use-search`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd idled-frontend && git add lib/api.ts lib/queries.ts tests/use-search.test.tsx
git commit -m "feat: searchAll api and useSearch hook"
```

---

### Task 7: Componente `Topbar` (breadcrumb + Nueva tarea + campana + buscador ⌘K)

**Files:**
- Create: `idled-frontend/components/Topbar.tsx`
- Test: `idled-frontend/tests/topbar.test.tsx`

**Interfaces:**
- Consumes: `useSearch` (Task 6), `useNotifications`, `useProjects`, `usePathname`/`useRouter` (next/navigation).
- Produces: `export default function Topbar()`. Se montará en el layout en la Task 9.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/topbar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))

import Topbar from '@/components/Topbar'

beforeEach(() => {
  localStorage.setItem('idled_token', 'header.payload.sig')
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ projects: [{ id: '1', name: 'Serie X', color: '#FAC51C' }], tasks: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
})

function renderTopbar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Topbar /></QueryClientProvider>)
}

describe('Topbar', () => {
  it('muestra el breadcrumb y el botón Nueva tarea', () => {
    renderTopbar()
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeTruthy()
  })

  it('busca y muestra resultados al escribir', async () => {
    renderTopbar()
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'serie' } })
    await waitFor(() => expect(screen.getByText('Serie X')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- topbar`
Expected: FAIL (`components/Topbar` no existe).

- [ ] **Step 3: Implementar `components/Topbar.tsx`**

```tsx
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
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- topbar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add components/Topbar.tsx tests/topbar.test.tsx
git commit -m "feat: Topbar with breadcrumb, notifications bell and global search"
```

---

### Task 8: `Sidebar` reformado (gris `#565656`, ficha de usuario, PROYECTOS colapsable)

**Files:**
- Modify: `idled-frontend/components/Sidebar.tsx`
- Test: `idled-frontend/tests/sidebar.test.tsx`

**Interfaces:**
- Consumes: `useNotifications`, `useProjects` (con `color`/`task_count`), `decodeToken` + `getToken`.
- Produces: `Sidebar` con lista de proyectos, ficha de usuario y sección colapsable. Sin cambios de firma (sigue exportando default sin props).

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/sidebar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/queries', () => ({
  useNotifications: () => ({ data: [] }),
  useProjects: () => ({ data: [{ id: 'p1', name: 'Serie X', color: '#FAC51C', task_count: 3 }] }),
}))

// token con name/role
function makeToken() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64')
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'ed@imasd.test', name: 'Edwin Cano', role: 'admin' })}.sig`
}

beforeEach(() => localStorage.setItem('idled_token', makeToken()))

import Sidebar from '@/components/Sidebar'

function renderSidebar() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><Sidebar /></QueryClientProvider>)
}

describe('Sidebar', () => {
  it('lista proyectos con contador', () => {
    renderSidebar()
    expect(screen.getByText('Serie X')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })
  it('muestra la ficha de usuario desde el token', () => {
    renderSidebar()
    expect(screen.getByText('Edwin Cano')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- sidebar`
Expected: FAIL (no aparece "Serie X" / "Edwin Cano").

- [ ] **Step 3: Reescribir `components/Sidebar.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { logout, getToken, decodeToken } from '@/lib/auth'
import { useNotifications, useProjects } from '@/lib/queries'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Asistente IA' },
  { href: '/documentos', label: 'Documentos' },
  { href: '/chat', label: 'Chat de equipo' },
]

const itemStyle = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9,
  fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none',
} as const

function initials(name: string | null, sub: string): string {
  const base = (name ?? sub ?? '').trim()
  if (!base) return '?'
  const parts = base.split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)).toUpperCase()
}

export default function Sidebar() {
  const { data: notifs } = useNotifications()
  const { data: projects } = useProjects()
  const [projectsOpen, setProjectsOpen] = useState(true)
  const unread = (notifs ?? []).filter((n) => !n.read).length
  const user = decodeToken(getToken())
  const list = projects ?? []

  return (
    <aside style={{ width: 250, flex: '0 0 250px', background: '#565656',
      borderRight: '1px solid rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', padding: '18px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: 'var(--bg-4)', flexShrink: 0 }}>I+D</div>
        <span style={{ fontWeight: 700, letterSpacing: '.06em', fontSize: 15, color: 'var(--text)' }}>IMASD</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="side-hover" style={itemStyle}>{n.label}</Link>
        ))}
        <Link href="/notifications" className="side-hover" style={itemStyle}>
          Notificaciones
          {unread > 0 && (
            <span data-testid="unread-badge" style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000',
              borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>{unread}</span>
          )}
        </Link>
        <span aria-disabled="true" style={{ ...itemStyle, opacity: 0.45, cursor: 'default' }}>Equipo · próximamente</span>
      </nav>

      <div onClick={() => setProjectsOpen((v) => !v)} className="side-hover"
        style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, cursor: 'pointer',
          fontSize: 10.5, letterSpacing: '.13em', color: 'rgba(255,255,255,.75)', fontWeight: 700,
          padding: '14px 10px 8px', marginTop: 6 }}>
        <span>PROYECTOS</span>
        <span className="mono" style={{ color: 'rgba(255,255,255,.55)', fontSize: 10 }}>{list.length}</span>
        <span style={{ marginLeft: 'auto', transform: `rotate(${projectsOpen ? 0 : -90}deg)`, transition: 'transform .18s' }}>⌄</span>
      </div>
      {projectsOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
          {list.map((p) => (
            <Link key={p.id} href={`/project/${p.id}`} className="side-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                textDecoration: 'none', fontSize: 13, color: '#ededed' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, flex: '0 0 auto', background: p.color ?? '#A9A9A9' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
              <span className="mono" style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>{p.task_count ?? 0}</span>
            </Link>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10,
        borderTop: '1px solid rgba(0,0,0,.25)', marginTop: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
          {initials(user?.name ?? null, user?.sub ?? '')}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ?? 'Usuario'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{user?.role ?? 'IMASD'}</div>
        </div>
        <button aria-label="cerrar sesión" onClick={() => logout()}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: 16 }}>⏻</button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- sidebar`
Expected: PASS.

- [ ] **Step 5: Verificar que no rompimos el test previo del sidebar**

Run: `cd idled-frontend && npm test -- sidebar Sidebar`
Expected: si existía un test antiguo de `unread-badge`, sigue en verde (el `data-testid="unread-badge"` se conservó). Si el nombre del archivo de test antiguo difiere, correr `npm test` completo en el Step del Task 9.

- [ ] **Step 6: Commit**

```bash
cd idled-frontend && git add components/Sidebar.tsx tests/sidebar.test.tsx
git commit -m "feat: reworked Sidebar (gray rail, user card, collapsible projects)"
```

---

### Task 9: Montar `Topbar` en el layout + verificación integral

**Files:**
- Modify: `idled-frontend/app/(app)/layout.tsx`
- Test: (reusa la suite completa)

**Interfaces:**
- Consumes: `Topbar` (Task 7), `Sidebar` (Task 8).
- Produces: layout con sidebar a la izquierda y, a la derecha, `Topbar` sobre el `main` con scroll.

- [ ] **Step 1: Modificar el layout**

Reemplazar el cuerpo de `app/(app)/layout.tsx` por:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (!getToken()) router.push('/login')
  }, [router])
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Correr toda la suite de tests del frontend**

Run: `cd idled-frontend && npm test`
Expected: PASS (incluye los tests nuevos y los ~45 existentes). Si algún test antiguo asumía el layout sin topbar, ajustarlo mínimamente.

- [ ] **Step 3: Verificación manual (app real)**

Con el stack levantado (`docker compose up -d` en `idled-backend`) y `npm run dev` en `idled-frontend`:
```bash
# reconstruir imagen backend para recoger el endpoint /api/search y color
cd idled-backend && docker compose up -d --build api worker
```
Abrir `http://localhost:3000`, login `admin@idled.test`. Verificar:
- Topbar visible con breadcrumb "Dashboard", botón "Nueva tarea", campana y buscador.
- Sidebar gris con ficha "Admin Total"/rol y sección PROYECTOS (crear un proyecto en Dashboard y ver que aparece con punto de color y contador).
- Escribir en el buscador el nombre de un proyecto/tarea → aparece en el panel → click navega.
- ⌘K enfoca el buscador.

- [ ] **Step 4: Commit**

```bash
cd idled-frontend && git add "app/(app)/layout.tsx"
git commit -m "feat: mount Topbar in app layout"
```

- [ ] **Step 5: (opcional) Actualizar `.env` backend**

Si el `.env` de `idled-backend` no tiene las claves de MinIO/embeddings del `.env.example`, no afecta a este bloque (tienen defaults). No se requiere cambio.

---

## Notas de verificación final del bloque

- Backend: `cd idled-backend && pytest tests/test_project_color_migration.py tests/test_project_color_service.py tests/test_projects_list_counts.py tests/test_search_endpoint.py -v` → todo verde.
- Frontend: `cd idled-frontend && npm test` → todo verde.
- Manual: los 4 puntos del Task 9 Step 3.
- Al terminar, este bloque queda en la rama `feature/marco-global` (frontend) + commits en `idled-backend`. Decidir merge/PR con el usuario (skill finishing-a-development-branch) antes de empezar el Bloque 2 (Dashboard).
