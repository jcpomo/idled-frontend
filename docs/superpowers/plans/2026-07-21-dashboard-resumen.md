# Dashboard de resumen (Bloque 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el Dashboard como el diseño de resumen: saludo + stats, card "Mis tareas de hoy" con filtros, y tarjetas de proyecto con barra de progreso — full-stack.

**Architecture:** Backend añade `done_count` a la lista de proyectos y un endpoint `GET /api/tasks/mine` (mis tareas asignadas cross-proyecto con progreso de subtareas). Frontend consume ambos vía React Query, con helpers puros para saludo/stats/filtros, y compone la nueva página del dashboard.

**Tech Stack:** Backend FastAPI + SQLAlchemy 2 async, Alembic (sin migración aquí), pytest en Docker. Frontend Next.js 14, React 18, TS, @tanstack/react-query, Vitest.

## Global Constraints

- Repos: `/Users/pomo/Documents/App/Bruno/idled-backend` y `/Users/pomo/Documents/App/Bruno/idled-frontend`, ambos rama `feature/dashboard-resumen`.
- Estados de tarea válidos: `open`, `progress`, `review`, `done` (`app/gestor/statuses.py`).
- "top-level" = `parent_id IS NULL`. "mías" = `assignee == user_external_id`. "no hechas" = `status != 'done'`.
- Ámbito de proyectos = propios O donde soy miembro (patrón de `list_projects`).
- Backend tests: `docker compose exec -T api pytest <ruta> -v`. Frontend tests: `npm test -- <filtro>` (baseline 134 passing).
- Fechas: `due_date`/`start_date` son strings `YYYY-MM-DD` o null. Fecha de hoy en front = `todayISO()` de `lib/dates.ts` (calendario local).
- UI en español, estilos inline con variables CSS (`var(--accent)` `#FAC51C`, `var(--bg-2)` `#111`, `var(--red)`, `var(--green)`, `var(--blue)`, `var(--orange)`, `var(--text)`, `var(--border)`).
- No romper tests existentes (`test_projects_endpoint.py`, `test_projects_list_counts.py`, dashboard/shell tests).

---

## Backend

### Task 1: `done_count` en la lista de proyectos

**Files:**
- Modify: `idled-backend/app/gestor/service.py` (`list_projects_with_counts`, imports)
- Modify: `idled-backend/app/api/projects.py` (`listar`)
- Test: `idled-backend/tests/test_projects_done_count.py`

**Interfaces:**
- Consumes: `Project`, `Task`.
- Produces: `list_projects_with_counts(session, user_external_id) -> list[tuple[Project, int, int]]` (project, task_count, done_count). `GET /api/projects` añade `done_count` por item.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_projects_done_count.py
import jwt as pyjwt
import pytest
import httpx
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"

def _token(sub="ext-dc", role="administracion"):
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
async def test_projects_list_includes_done_count(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        t1 = (await ac.post(f"/api/projects/{pid}/tasks", json={"title": "A"}, headers=h)).json()["id"]
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "B"}, headers=h)
        # marcar t1 como done vía move
        await ac.post(f"/api/tasks/{t1}/move", json={"status": "done", "position": 0}, headers=h)
        row = next(p for p in (await ac.get("/api/projects", headers=h)).json() if p["id"] == pid)
        assert row["task_count"] == 2
        assert row["done_count"] == 1
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_projects_done_count.py -v`
Expected: FAIL (`KeyError: 'done_count'`).

- [ ] **Step 3: Extender `list_projects_with_counts`**

En `app/gestor/service.py`, añadir `case` al import de sqlalchemy (línea con `from sqlalchemy import delete, func as safunc, select, or_, exists` → añadir `, case`). Reemplazar el cuerpo de `list_projects_with_counts`:

```python
async def list_projects_with_counts(
    session: AsyncSession, user_external_id: str
) -> list[tuple[Project, int, int]]:
    projects = await list_projects(session, user_external_id)
    if not projects:
        return []
    ids = [p.id for p in projects]
    result = await session.execute(
        select(
            Task.project_id,
            safunc.count(Task.id),
            safunc.sum(case((Task.status == "done", 1), else_=0)),
        )
        .where(Task.project_id.in_(ids), Task.parent_id.is_(None))
        .group_by(Task.project_id)
    )
    counts = {pid: (total, int(done or 0)) for pid, total, done in result.all()}
    return [(p, counts.get(p.id, (0, 0))[0], counts.get(p.id, (0, 0))[1]) for p in projects]
```

- [ ] **Step 4: Actualizar el endpoint `listar`**

En `app/api/projects.py`, reemplazar el cuerpo de `listar`:

```python
@router.get("")
async def listar(user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = await list_projects_with_counts(session, user.external_id)
    return [{"id": str(p.id), "name": p.name, "color": p.color,
             "task_count": count, "done_count": done,
             "created_at": p.created_at.isoformat() if p.created_at else None,
             "is_owner": p.user_external_id == user.external_id}
            for p, count, done in rows]
```

- [ ] **Step 5: Ejecutar y ver que pasa (+ regresión)**

Run:
```bash
cd idled-backend && docker compose exec -T api pytest tests/test_projects_done_count.py tests/test_projects_list_counts.py tests/test_projects_endpoint.py -v
```
Expected: PASS (todo verde; `test_projects_list_counts` sigue OK porque `task_count` no cambió).

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/service.py app/api/projects.py tests/test_projects_done_count.py
git commit -m "feat(gestor): add done_count to projects list"
```

---

### Task 2: `GET /api/tasks/mine`

**Files:**
- Modify: `idled-backend/app/gestor/service.py` (nueva `list_my_tasks`, imports)
- Modify: `idled-backend/app/api/tasks.py` (nueva ruta `/mine` ANTES de `/{task_id}`)
- Test: `idled-backend/tests/test_tasks_mine.py`

**Interfaces:**
- Consumes: `Task`, `Project`, `ProjectMember`.
- Produces:
  - `list_my_tasks(session, user_external_id) -> list[dict]`, cada dict:
    `{id, title, project_id, project_name, status, due_date, subtask_done, subtask_total}`.
  - `GET /api/tasks/mine` → esa lista.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_tasks_mine.py
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
async def test_mine_returns_own_assigned_toplevel_non_done_with_subtask_progress(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token('ext-me')}"}
        pid = (await ac.post("/api/projects", json={"name": "Proj"}, headers=h)).json()["id"]
        # tarea asignada a mí
        mine = (await ac.post(f"/api/projects/{pid}/tasks",
                json={"title": "Mía", "assignee": "ext-me", "due_date": "2026-07-21"}, headers=h)).json()["id"]
        # 2 subtareas, 1 done
        s1 = (await ac.post(f"/api/tasks/{mine}/subtasks", json={"title": "s1"}, headers=h)).json()["id"]
        await ac.post(f"/api/tasks/{mine}/subtasks", json={"title": "s2"}, headers=h)
        await ac.patch(f"/api/tasks/{s1}", json={"status": "done"}, headers=h)
        # tarea sin asignar (no debe salir)
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "SinAsig"}, headers=h)
        # tarea mía pero done (no debe salir)
        d = (await ac.post(f"/api/projects/{pid}/tasks",
             json={"title": "Hecha", "assignee": "ext-me"}, headers=h)).json()["id"]
        await ac.post(f"/api/tasks/{d}/move", json={"status": "done", "position": 0}, headers=h)

        rows = (await ac.get("/api/tasks/mine", headers=h)).json()
        assert len(rows) == 1
        r = rows[0]
        assert r["title"] == "Mía" and r["project_name"] == "Proj"
        assert r["due_date"] == "2026-07-21" and r["status"] != "done"
        assert r["subtask_total"] == 2 and r["subtask_done"] == 1

@pytest.mark.asyncio
async def test_mine_is_user_scoped(client):
    async with client as ac:
        ha = {"Authorization": f"Bearer {_token('ext-a')}"}
        hb = {"Authorization": f"Bearer {_token('ext-b')}"}
        pid = (await ac.post("/api/projects", json={"name": "A"}, headers=ha)).json()["id"]
        await ac.post(f"/api/projects/{pid}/tasks", json={"title": "T", "assignee": "ext-a"}, headers=ha)
        # ext-b no ve nada de ext-a
        assert (await ac.get("/api/tasks/mine", headers=hb)).json() == []
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_tasks_mine.py -v`
Expected: FAIL (404 en `/api/tasks/mine`, o `mine` interpretado como uuid → 422).

- [ ] **Step 3: Implementar `list_my_tasks` en `service.py`**

Añadir tras `list_projects_with_counts` (usa `select`, `safunc`, `or_`, `exists`, `case` ya importados; `Project`, `Task`, `ProjectMember` ya importados):

```python
async def list_my_tasks(session: AsyncSession, user_external_id: str) -> list[dict]:
    member = exists().where(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_external_id == user_external_id,
    )
    result = await session.execute(
        select(Task, Project.name)
        .join(Project, Task.project_id == Project.id)
        .where(
            Task.parent_id.is_(None),
            Task.assignee == user_external_id,
            Task.status != "done",
            or_(Project.user_external_id == user_external_id, member),
        )
    )
    rows = result.all()
    tasks = [t for t, _ in rows]
    names = {t.id: name for t, name in rows}
    sub_counts: dict = {}
    if tasks:
        task_ids = [t.id for t in tasks]
        sub_result = await session.execute(
            select(
                Task.parent_id,
                safunc.count(Task.id),
                safunc.sum(case((Task.status == "done", 1), else_=0)),
            )
            .where(Task.parent_id.in_(task_ids))
            .group_by(Task.parent_id)
        )
        sub_counts = {pid: (int(total), int(done or 0)) for pid, total, done in sub_result.all()}
    # orden: con fecha primero (asc), sin fecha al final; desempate por created_at
    def sort_key(t: Task):
        return (t.due_date is None, t.due_date or "", t.created_at)
    tasks_sorted = sorted(tasks, key=sort_key)
    return [{
        "id": str(t.id), "title": t.title, "project_id": str(t.project_id),
        "project_name": names.get(t.id, ""), "status": t.status, "due_date": t.due_date,
        "subtask_done": sub_counts.get(t.id, (0, 0))[1],
        "subtask_total": sub_counts.get(t.id, (0, 0))[0],
    } for t in tasks_sorted]
```

- [ ] **Step 4: Añadir la ruta `/mine` ANTES de `/{task_id}`**

En `app/api/tasks.py`: añadir `list_my_tasks` al import desde `app.gestor.service`. Insertar la ruta **inmediatamente después de `router = APIRouter(...)` y las clases Body, ANTES del primer `@router.patch("/{task_id}")`** (para que `mine` no se capture como uuid):

```python
@router.get("/mine")
async def mis_tareas(user: User = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> list[dict]:
    return await list_my_tasks(session, user.external_id)
```

- [ ] **Step 5: Ejecutar y ver que pasa (+ regresión)**

Run:
```bash
cd idled-backend && docker compose exec -T api pytest tests/test_tasks_mine.py tests/test_tasks_endpoint.py tests/test_gestor_subtasks.py -v
```
Expected: PASS (los tests de `/{task_id}` siguen verdes; `/mine` no colisiona).

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/service.py app/api/tasks.py tests/test_tasks_mine.py
git commit -m "feat(gestor): GET /api/tasks/mine (my assigned tasks with subtask progress)"
```

---

## Frontend

### Task 3: Data layer (tipos + api + hook)

**Files:**
- Modify: `idled-frontend/lib/types.ts` (`Project.done_count`, nuevo `MyTask`)
- Modify: `idled-frontend/lib/api.ts` (`listMyTasks`)
- Modify: `idled-frontend/lib/queries.ts` (`useMyTasks`)
- Test: `idled-frontend/tests/use-my-tasks.test.tsx`

**Interfaces:**
- Produces:
  - `Project` gana `done_count?: number`.
  - `MyTask { id; title; project_id; project_name; status; due_date: string | null; subtask_done: number; subtask_total: number }`.
  - `listMyTasks(token: string): Promise<MyTask[]>` → `GET /api/tasks/mine`.
  - `useMyTasks()` — React Query, token-gated, key `['my-tasks']`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/use-my-tasks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMyTasks } from '@/lib/queries'

beforeEach(() => { localStorage.setItem('idled_token', 'h.p.s') })

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useMyTasks', () => {
  it('devuelve mis tareas', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        { id: '1', title: 'Mía', project_id: 'p1', project_name: 'Proj', status: 'open',
          due_date: '2026-07-21', subtask_done: 1, subtask_total: 2 },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useMyTasks(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0].title).toBe('Mía'))
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- use-my-tasks`
Expected: FAIL (`useMyTasks` no existe).

- [ ] **Step 3: Extender tipos en `lib/types.ts`**

En la interfaz `Project` añadir `done_count?: number` (junto a `task_count?`). Añadir al final:

```ts
export interface MyTask {
  id: string
  title: string
  project_id: string
  project_name: string
  status: string
  due_date: string | null
  subtask_done: number
  subtask_total: number
}
```

- [ ] **Step 4: Añadir `listMyTasks` en `lib/api.ts`**

Añadir `MyTask` al import de tipos (línea 1) y la función junto a las demás:

```ts
export const listMyTasks = (token: string) =>
  apiFetch<MyTask[]>('/api/tasks/mine', { token })
```

- [ ] **Step 5: Añadir `useMyTasks` en `lib/queries.ts`**

Añadir al final:

```ts
export function useMyTasks() {
  return useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.listMyTasks(token()),
    enabled: Boolean(getToken()),
  })
}
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- use-my-tasks`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts tests/use-my-tasks.test.tsx
git commit -m "feat: MyTask type, listMyTasks api and useMyTasks hook"
```

---

### Task 4: Helpers puros de dashboard (saludo, stats, filtros)

**Files:**
- Create: `idled-frontend/lib/dashboard.ts`
- Test: `idled-frontend/tests/dashboard-helpers.test.ts`

**Interfaces:**
- Consumes: `MyTask` (Task 3), `todayISO`/`addDays` de `lib/dates.ts`.
- Produces:
  - `greeting(hour: number): string` — "Buenos días" (5–11), "Buenas tardes" (12–19), "Buenas noches" (resto).
  - `taskStats(tasks: MyTask[], today: string): { today: number; overdue: number }` — today = `due_date === today`; overdue = `due_date` no null y `< today`.
  - `filterMyTasks(tasks: MyTask[], filter: 'all'|'today'|'overdue'|'week', today: string): MyTask[]` — all = todas; today = `due_date === today`; overdue = `due_date < today`; week = `due_date` en `[today, today+7]` inclusive.

- [ ] **Step 1: Escribir el test que falla**

```ts
// idled-frontend/tests/dashboard-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { greeting, taskStats, filterMyTasks } from '@/lib/dashboard'
import type { MyTask } from '@/lib/types'

const mk = (id: string, due: string | null): MyTask => ({
  id, title: id, project_id: 'p', project_name: 'P', status: 'open',
  due_date: due, subtask_done: 0, subtask_total: 0,
})

describe('greeting', () => {
  it('cambia por hora', () => {
    expect(greeting(8)).toBe('Buenos días')
    expect(greeting(15)).toBe('Buenas tardes')
    expect(greeting(23)).toBe('Buenas noches')
  })
})

describe('taskStats', () => {
  it('cuenta hoy y atrasadas', () => {
    const today = '2026-07-21'
    const tasks = [mk('a', '2026-07-21'), mk('b', '2026-07-20'), mk('c', '2026-07-25'), mk('d', null)]
    expect(taskStats(tasks, today)).toEqual({ today: 1, overdue: 1 })
  })
})

describe('filterMyTasks', () => {
  const today = '2026-07-21'
  const tasks = [mk('a', '2026-07-21'), mk('b', '2026-07-20'), mk('c', '2026-07-25'), mk('d', '2026-08-30'), mk('e', null)]
  it('all devuelve todas', () => { expect(filterMyTasks(tasks, 'all', today)).toHaveLength(5) })
  it('today', () => { expect(filterMyTasks(tasks, 'today', today).map(t => t.id)).toEqual(['a']) })
  it('overdue', () => { expect(filterMyTasks(tasks, 'overdue', today).map(t => t.id)).toEqual(['b']) })
  it('week incluye hoy..+7', () => { expect(filterMyTasks(tasks, 'week', today).map(t => t.id).sort()).toEqual(['a', 'c']) })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- dashboard-helpers`
Expected: FAIL (`@/lib/dashboard` no existe).

- [ ] **Step 3: Implementar `lib/dashboard.ts`**

```ts
import type { MyTask } from '@/lib/types'
import { addDays } from '@/lib/dates'

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

export function taskStats(tasks: MyTask[], today: string): { today: number; overdue: number } {
  let t = 0, o = 0
  for (const task of tasks) {
    if (!task.due_date) continue
    if (task.due_date === today) t++
    else if (task.due_date < today) o++
  }
  return { today: t, overdue: o }
}

export type MyTasksFilter = 'all' | 'today' | 'overdue' | 'week'

export function filterMyTasks(tasks: MyTask[], filter: MyTasksFilter, today: string): MyTask[] {
  if (filter === 'all') return tasks
  if (filter === 'today') return tasks.filter((t) => t.due_date === today)
  if (filter === 'overdue') return tasks.filter((t) => t.due_date != null && t.due_date < today)
  // week: due en [today, today+7] inclusive
  const end = addDays(today, 7)
  return tasks.filter((t) => t.due_date != null && t.due_date >= today && t.due_date <= end)
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- dashboard-helpers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add lib/dashboard.ts tests/dashboard-helpers.test.ts
git commit -m "feat: pure dashboard helpers (greeting, taskStats, filterMyTasks)"
```

---

### Task 5: `MyTasksCard` (lista + chips de filtro)

**Files:**
- Create: `idled-frontend/components/dashboard/MyTasksCard.tsx`
- Test: `idled-frontend/tests/my-tasks-card.test.tsx`

**Interfaces:**
- Consumes: `useMyTasks` (Task 3), `filterMyTasks` (Task 4), `todayISO` (`lib/dates.ts`), `useRouter`.
- Produces: `export default function MyTasksCard()`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/my-tasks-card.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/lib/dates', async (orig) => ({ ...(await orig()), todayISO: () => '2026-07-21' }))
vi.mock('@/lib/queries', () => ({
  useMyTasks: () => ({ data: [
    { id: '1', title: 'Hoy', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-21', subtask_done: 1, subtask_total: 2 },
    { id: '2', title: 'Atrasada', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-01', subtask_done: 0, subtask_total: 0 },
  ], isError: false }),
}))

import MyTasksCard from '@/components/dashboard/MyTasksCard'

function renderCard() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><MyTasksCard /></QueryClientProvider>)
}

beforeEach(() => pushMock.mockClear())

describe('MyTasksCard', () => {
  it('lista mis tareas y filtra por Atrasadas', () => {
    renderCard()
    expect(screen.getByText('Hoy')).toBeTruthy()
    expect(screen.getByText('Atrasada')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Atrasadas' }))
    expect(screen.queryByText('Hoy')).toBeNull()
    expect(screen.getByText('Atrasada')).toBeTruthy()
  })
  it('click en una fila navega al proyecto', () => {
    renderCard()
    fireEvent.click(screen.getByText('Hoy'))
    expect(pushMock).toHaveBeenCalledWith('/project/p1')
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- my-tasks-card`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar `components/dashboard/MyTasksCard.tsx`**

```tsx
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
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- my-tasks-card`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add components/dashboard/MyTasksCard.tsx tests/my-tasks-card.test.tsx
git commit -m "feat: MyTasksCard with status colors and filter chips"
```

---

### Task 6: `ProjectCard` (tarjeta con barra de progreso)

**Files:**
- Create: `idled-frontend/components/dashboard/ProjectCard.tsx`
- Test: `idled-frontend/tests/project-card.test.tsx`

**Interfaces:**
- Consumes: `Project` (con `color`, `task_count`, `done_count`).
- Produces: `export default function ProjectCard({ project }: { project: Project })` — enlaza a `/project/{id}`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/project-card.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import ProjectCard from '@/components/dashboard/ProjectCard'

describe('ProjectCard', () => {
  it('muestra progreso done/total como porcentaje', () => {
    render(<ProjectCard project={{ id: 'p1', name: 'Serie X', color: '#FF7F24', task_count: 4, done_count: 1 }} />)
    expect(screen.getByText('Serie X')).toBeTruthy()
    expect(screen.getByText('4 tareas')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/project/p1')
  })
  it('0 tareas → 0%', () => {
    render(<ProjectCard project={{ id: 'p2', name: 'Vacío', color: '#FAC51C', task_count: 0, done_count: 0 }} />)
    expect(screen.getByText('0%')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- project-card`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar `components/dashboard/ProjectCard.tsx`**

```tsx
'use client'
import Link from 'next/link'
import type { Project } from '@/lib/types'

export default function ProjectCard({ project }: { project: Project }) {
  const total = project.task_count ?? 0
  const done = project.done_count ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const color = project.color ?? '#A9A9A9'
  return (
    <Link href={`/project/${project.id}`} className="card-hover"
      style={{ display: 'block', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flex: '0 0 auto' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
        {project.is_owner === false && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8a8a8a' }}>compartido</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span className="mono" style={{ fontSize: 11, color: '#8a8a8a' }}>{total} tareas</span>
        <span className="mono" style={{ fontSize: 11, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: '#222', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color }} />
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- project-card`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add components/dashboard/ProjectCard.tsx tests/project-card.test.tsx
git commit -m "feat: ProjectCard with progress bar"
```

---

### Task 7: Reescribir la página del Dashboard + verificación

**Files:**
- Modify: `idled-frontend/app/(app)/dashboard/page.tsx`
- Test: `idled-frontend/tests/dashboard.test.tsx` (REEMPLAZAR el contenido del archivo existente)

**Interfaces:**
- Consumes: `useMyTasks`, `useProjects`, `useCreateProject`, `greeting`, `taskStats`, `MyTasksCard`, `ProjectCard`, `decodeToken`+`getToken`, `todayISO`.
- Produces: la nueva página del dashboard.

- [ ] **Step 1: (contexto) el test viejo se reemplaza**

El archivo `tests/dashboard.test.tsx` YA existe y valida el dashboard viejo (lista proyectos + etiqueta "compartido" con `is_owner===false`). En el Step 2 se **reemplaza su contenido completo** por el test nuevo, que conserva la aserción de "compartido" y añade saludo/stats/progreso.

- [ ] **Step 2: Reemplazar el contenido de `tests/dashboard.test.tsx` con el test que falla**

```tsx
// idled-frontend/tests/dashboard.test.tsx  (reemplaza TODO el contenido)
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/dates', async (orig) => ({ ...(await orig() as object), todayISO: () => '2026-07-21' }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig() as object),
  getToken: () => 'h.p.s', decodeToken: () => ({ sub: 'ed', name: 'Edwin', role: 'admin' }) }))
vi.mock('@/lib/queries', () => ({
  useMyTasks: () => ({ data: [
    { id: '1', title: 'Hoy', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-21', subtask_done: 0, subtask_total: 0 },
    { id: '2', title: 'Vieja', project_id: 'p1', project_name: 'P', status: 'open', due_date: '2026-07-01', subtask_done: 0, subtask_total: 0 },
  ], isError: false }),
  useProjects: () => ({ data: [
    { id: 'p1', name: 'Serie X', color: '#FF7F24', task_count: 4, done_count: 1 },
    { id: 'p2', name: 'Ajeno', color: '#FAC51C', task_count: 0, done_count: 0, is_owner: false },
  ], isLoading: false }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
}))

import Dashboard from '@/app/(app)/dashboard/page'

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><Dashboard /></QueryClientProvider>)
}

describe('Dashboard', () => {
  it('saluda por nombre y muestra stats hoy/atrasadas', () => {
    renderPage()
    expect(screen.getByText(/Edwin/)).toBeTruthy()
    expect(screen.getByText(/1 tarea/)).toBeTruthy()
    expect(screen.getByText(/1 atrasada/)).toBeTruthy()
  })
  it('muestra tarjetas de proyecto con progreso y etiqueta compartido', () => {
    renderPage()
    expect(screen.getByText('Serie X')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('Ajeno')).toBeTruthy()
    expect(screen.getAllByText('compartido')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Reescribir `app/(app)/dashboard/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useProjects, useCreateProject, useMyTasks } from '@/lib/queries'
import { getToken, decodeToken } from '@/lib/auth'
import { greeting, taskStats } from '@/lib/dashboard'
import { todayISO } from '@/lib/dates'
import MyTasksCard from '@/components/dashboard/MyTasksCard'
import ProjectCard from '@/components/dashboard/ProjectCard'
import type { MyTask } from '@/lib/types'

export default function Dashboard() {
  const { data: projects, isLoading } = useProjects()
  const { data: myTasks } = useMyTasks()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const user = decodeToken(getToken())
  const firstName = (user?.name ?? '').split(/\s+/)[0] || 'de nuevo'
  const today = todayISO()
  const mine: MyTask[] = Array.isArray(myTasks) ? myTasks : []
  const stats = taskStats(mine, today)

  return (
    <div style={{ padding: '28px 30px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 3, color: 'var(--text)' }}>
        {greeting(new Date().getHours())}, {firstName}
      </div>
      <div style={{ color: '#7a7a7a', fontSize: 14, marginBottom: 22 }}>
        Tienes <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.today} tarea{stats.today === 1 ? '' : 's'}</span> para hoy
        {' '}y <span style={{ color: 'var(--red)', fontWeight: 600 }}>{stats.overdue} atrasada{stats.overdue === 1 ? '' : 's'}</span>.
      </div>

      <div style={{ marginBottom: 22 }}>
        <MyTasksCard />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Proyectos</span>
        <button onClick={() => setAdding((v) => !v)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
          + Nuevo proyecto
        </button>
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input aria-label="nuevo proyecto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto"
            style={{ padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
          <button onClick={() => { if (name.trim()) { create.mutate(name.trim()); setName(''); setAdding(false) } }} disabled={create.isPending}
            style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Crear
          </button>
        </div>
      )}
      {isLoading ? (
        <p style={{ color: 'var(--text)' }}>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {(projects ?? []).map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar el test y la suite completa**

Run: `cd idled-frontend && npm test`
Expected: PASS. Si un test viejo del dashboard rompe por el cambio de layout, adaptarlo mínimamente (el test nuevo cubre saludo/stats/tarjeta; la creación de proyecto sigue disponible tras "+ Nuevo proyecto").

- [ ] **Step 5: Verificación en vivo (controlador)**

Con backend levantado (`docker compose up -d` en idled-backend) y `npm run dev` en idled-frontend:
```bash
# el api usa uvicorn --reload; si no sirve /api/tasks/mine, reiniciar:
cd idled-backend && docker compose restart api
```
Login `admin@idled.test`, verificar en `/dashboard`: saludo con nombre, línea de stats (hoy/atrasadas), card "Mis tareas de hoy" con chips que filtran, y tarjetas de proyecto con barra de progreso. Crear una tarea asignada a admin con fecha de hoy y comprobar que aparece en "Mis tareas".

- [ ] **Step 6: Commit**

```bash
cd idled-frontend && git add "app/(app)/dashboard/page.tsx" tests/dashboard.test.tsx
git commit -m "feat: rewrite dashboard (greeting, my tasks, project progress cards)"
```

---

## Notas de verificación final del bloque

- Backend: `docker compose exec -T api pytest tests/test_projects_done_count.py tests/test_tasks_mine.py -v` verde.
- Frontend: `npm test` verde.
- Manual: los puntos del Task 7 Step 5.
- Al terminar: rama `feature/dashboard-resumen` en ambos repos → decidir merge con el usuario (finishing-a-development-branch). Luego Bloque 2B (tipos+plantillas+crear rápida).
