# Tipos de tarea + plantillas + crear rápida (Bloque 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un catálogo global de tipos de tarea con plantillas de subtareas (CRUD, RBAC), generación automática de subtareas al crear tareas, y la card de "crear tarea rápida" + el gestor de tipos en el Dashboard — full-stack.

**Architecture:** Backend: modelo global `TaskType` (con plantilla de subtareas como lista JSON) + servicio CRUD + endpoints (lectura abierta, escritura gated por permiso RBAC `task_types:write`), y `create_task` genera subtareas desde una lista opcional. Frontend: data layer + `TaskTypesManager` (editor CRUD) + `QuickCreateCard` (crear con auto-subtareas) integrados en el Dashboard.

**Tech Stack:** Backend FastAPI, SQLAlchemy 2 async (columna `JSON`), Alembic, pytest (Docker). Frontend Next.js 14, React 18, TS, react-query, Vitest.

## Global Constraints

- Repos: `/Users/pomo/Documents/App/Bruno/idled-backend` y `/Users/pomo/Documents/App/Bruno/idled-frontend`, ambos rama `feature/tipos-tarea` (base backend 6370590, frontend a3ef63f).
- Tipos **globales** (sin owner). Gestión (crear/editar/borrar) solo **admin/direccion** vía permiso `task_types:write`; **lectura abierta** a cualquier autenticado.
- Plantilla de subtareas = lista JSON ordenada de nombres (`subtasks: list[str]`).
- Semilla (3 tipos, posición 0/1/2):
  - PPTO `#FAC51C`: `["Estudio Eng. y viabilidad","BOM","Solicitar RFQ","Creación y envío PPTO","Aprobación PPTO","Alta artículo"]`
  - MUESTRAS `#FF7F24`: `["Definir requisitos","Solicitar muestra a proveedor","Recepción de muestras","Validación de calidad","Informe de muestras"]`
  - NUEVO DISEÑO `#46C26A`: `["Brief de diseño","Bocetos / concepto","Modelado 3D","Render y revisión","Validación cliente","Entrega archivos producción"]`
- Backend tests: `docker compose exec -T api pytest <ruta> -v` (SQLite in-memory via create_all). Frontend: `npm test -- <filtro>` (baseline 145).
- Retrocompat: `Task.task_type` sigue siendo el **nombre** (string); tareas existentes intactas. Borrar un tipo NO borra tareas.
- Paleta de colores para tipos (selector): `#FAC51C, #FF7F24, #46C26A, #4FB6E8, #E5484D, #C9A227, #A9A9A9`.
- UI en español, estilos inline con variables CSS.

---

## Backend

### Task 1: Modelo `TaskType` + migración + semilla

**Files:**
- Modify: `idled-backend/app/gestor/models.py` (clase `TaskType`, import `JSON`)
- Create: `idled-backend/migrations/versions/d3e5f7a9b1c3_task_types.py`
- Test: `idled-backend/tests/test_task_type_model.py`

**Interfaces:**
- Produces: `TaskType` (tabla `task_types`): `id: Uuid PK`, `name: str`, `color: str`, `subtasks: list[str]` (JSON, default []), `position: int`, `created_at`.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_task_type_model.py
import pytest
from sqlalchemy import select
from app.gestor.models import TaskType

@pytest.mark.asyncio
async def test_task_type_roundtrips_subtasks_json(session):
    tt = TaskType(name="PPTO", color="#FAC51C", subtasks=["a", "b", "c"], position=0)
    session.add(tt)
    await session.commit()
    await session.refresh(tt)
    got = (await session.execute(select(TaskType).where(TaskType.name == "PPTO"))).scalar_one()
    assert got.color == "#FAC51C"
    assert got.subtasks == ["a", "b", "c"]
    assert got.position == 0
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_type_model.py -v`
Expected: FAIL (`ImportError: cannot import name 'TaskType'`).

- [ ] **Step 3: Añadir el modelo**

En `app/gestor/models.py`: añadir `JSON` al import de sqlalchemy (`from sqlalchemy import String, Integer, DateTime, Uuid, func, Text, ForeignKey, UniqueConstraint, JSON`). Añadir al final:

```python
class TaskType(Base):
    __tablename__ = "task_types"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, unique=True)
    color: Mapped[str] = mapped_column(String, default="#FAC51C")
    subtasks: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Crear la migración (tabla + semilla)**

Crear `migrations/versions/d3e5f7a9b1c3_task_types.py` (down_revision = head backend actual `c1a2b3d4e5f6`... verificar con `docker compose exec -T api alembic heads`; usar el head real):

```python
"""task types

Revision ID: d3e5f7a9b1c3
Revises: c1a2b3d4e5f6
Create Date: 2026-07-21 00:00:00.000000
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa

revision: str = 'd3e5f7a9b1c3'
down_revision: Union[str, Sequence[str], None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEEDS = [
    ("PPTO", "#FAC51C", ["Estudio Eng. y viabilidad", "BOM", "Solicitar RFQ", "Creación y envío PPTO", "Aprobación PPTO", "Alta artículo"]),
    ("MUESTRAS", "#FF7F24", ["Definir requisitos", "Solicitar muestra a proveedor", "Recepción de muestras", "Validación de calidad", "Informe de muestras"]),
    ("NUEVO DISEÑO", "#46C26A", ["Brief de diseño", "Bocetos / concepto", "Modelado 3D", "Render y revisión", "Validación cliente", "Entrega archivos producción"]),
]

def upgrade() -> None:
    task_types = op.create_table(
        'task_types',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=False, server_default='#FAC51C'),
        sa.Column('subtasks', sa.JSON(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.bulk_insert(task_types, [
        {"id": uuid.uuid4(), "name": n, "color": c, "subtasks": subs, "position": i}
        for i, (n, c, subs) in enumerate(SEEDS)
    ])

def downgrade() -> None:
    op.drop_table('task_types')
```

- [ ] **Step 5: Aplicar migración + correr el test**

Run:
```bash
cd idled-backend && docker compose exec -T api alembic upgrade head
docker compose exec -T api pytest tests/test_task_type_model.py -v
```
Expected: migración `d3e5f7a9b1c3` aplicada; test PASS. (Nota: el test usa SQLite create_all, no la semilla; la semilla se verifica en vivo en Task 8.)

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/models.py migrations/versions/d3e5f7a9b1c3_task_types.py tests/test_task_type_model.py
git commit -m "feat(gestor): TaskType model + migration with seeded defaults"
```

---

### Task 2: Servicio CRUD de tipos + permiso RBAC

**Files:**
- Create: `idled-backend/app/gestor/task_types_service.py`
- Modify: `idled-backend/app/auth/roles.py` (permiso `task_types:write` a DIRECCION)
- Test: `idled-backend/tests/test_task_types_service.py`

**Interfaces:**
- Produces:
  - `DEFAULT_TASK_TYPES: list[dict]` (3 dicts `{name,color,subtasks}`).
  - `list_task_types(session) -> list[TaskType]` (orden position, name).
  - `create_task_type(session, name, color, subtasks) -> TaskType` (position = max+1).
  - `update_task_type(session, id, *, name=None, color=None, subtasks=None) -> TaskType | None`.
  - `delete_task_type(session, id) -> bool`.
  - `Role.DIRECCION` gana permiso `task_types:write`.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_task_types_service.py
import pytest
from app.gestor.task_types_service import (
    DEFAULT_TASK_TYPES, list_task_types, create_task_type, update_task_type, delete_task_type,
)
from app.auth.roles import Role, has_permission

def test_defaults_and_permission():
    assert [d["name"] for d in DEFAULT_TASK_TYPES] == ["PPTO", "MUESTRAS", "NUEVO DISEÑO"]
    assert has_permission(Role.DIRECCION, "task_types:write")
    assert has_permission(Role.ADMIN, "task_types:write")
    assert not has_permission(Role.LECTURA, "task_types:write")

@pytest.mark.asyncio
async def test_crud(session):
    a = await create_task_type(session, "A", "#FAC51C", ["x"])
    b = await create_task_type(session, "B", "#FF7F24", [])
    assert a.position == 0 and b.position == 1
    upd = await update_task_type(session, a.id, subtasks=["x", "y"], color="#46C26A")
    assert upd is not None and upd.subtasks == ["x", "y"] and upd.color == "#46C26A"
    types = await list_task_types(session)
    assert [t.name for t in types] == ["A", "B"]
    assert await delete_task_type(session, b.id) is True
    assert [t.name for t in await list_task_types(session)] == ["A"]
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_types_service.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Añadir el permiso en `app/auth/roles.py`**

En el set de `Role.DIRECCION`, añadir `"task_types:write"`:

```python
    Role.DIRECCION: {
        "facturas:read", "compras:read", "ventas:read", "stock:read", "kpis:read",
        "documentos:read", "task_types:write",
    },
```

- [ ] **Step 4: Crear `app/gestor/task_types_service.py`**

```python
import uuid
from sqlalchemy import select, func as safunc, delete as sadelete
from sqlalchemy.ext.asyncio import AsyncSession
from app.gestor.models import TaskType

DEFAULT_TASK_TYPES: list[dict] = [
    {"name": "PPTO", "color": "#FAC51C", "subtasks": ["Estudio Eng. y viabilidad", "BOM", "Solicitar RFQ", "Creación y envío PPTO", "Aprobación PPTO", "Alta artículo"]},
    {"name": "MUESTRAS", "color": "#FF7F24", "subtasks": ["Definir requisitos", "Solicitar muestra a proveedor", "Recepción de muestras", "Validación de calidad", "Informe de muestras"]},
    {"name": "NUEVO DISEÑO", "color": "#46C26A", "subtasks": ["Brief de diseño", "Bocetos / concepto", "Modelado 3D", "Render y revisión", "Validación cliente", "Entrega archivos producción"]},
]

async def list_task_types(session: AsyncSession) -> list[TaskType]:
    result = await session.execute(select(TaskType).order_by(TaskType.position, TaskType.name))
    return list(result.scalars().all())

async def create_task_type(session: AsyncSession, name: str, color: str, subtasks: list[str]) -> TaskType:
    max_pos = (await session.execute(select(safunc.max(TaskType.position)))).scalar()
    position = 0 if max_pos is None else max_pos + 1
    tt = TaskType(name=name, color=color, subtasks=list(subtasks), position=position)
    session.add(tt)
    await session.commit()
    await session.refresh(tt)
    return tt

async def update_task_type(
    session: AsyncSession, type_id: uuid.UUID, *,
    name: str | None = None, color: str | None = None, subtasks: list[str] | None = None,
) -> TaskType | None:
    tt = (await session.execute(select(TaskType).where(TaskType.id == type_id))).scalar_one_or_none()
    if tt is None:
        return None
    if name is not None:
        tt.name = name
    if color is not None:
        tt.color = color
    if subtasks is not None:
        tt.subtasks = list(subtasks)
    await session.commit()
    await session.refresh(tt)
    return tt

async def delete_task_type(session: AsyncSession, type_id: uuid.UUID) -> bool:
    tt = (await session.execute(select(TaskType).where(TaskType.id == type_id))).scalar_one_or_none()
    if tt is None:
        return False
    await session.execute(sadelete(TaskType).where(TaskType.id == type_id))
    await session.commit()
    return True
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_types_service.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/task_types_service.py app/auth/roles.py tests/test_task_types_service.py
git commit -m "feat(gestor): task types CRUD service + task_types:write permission"
```

---

### Task 3: Endpoints de tipos de tarea

**Files:**
- Create: `idled-backend/app/api/task_types.py`
- Modify: `idled-backend/app/main.py` (registrar router)
- Test: `idled-backend/tests/test_task_types_endpoint.py`

**Interfaces:**
- Consumes: servicio de Task 2, `require_permission`.
- Produces: `GET /api/task-types` (auth), `POST` / `PATCH /{id}` / `DELETE /{id}` (gated `task_types:write`). Item: `{id,name,color,subtasks,position}`.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_task_types_endpoint.py
import jwt as pyjwt
import pytest
import httpx
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"

def _token(role):
    return pyjwt.encode({"sub": f"u-{role}", "role": role, "name": "Q"}, SECRET, algorithm="HS256")

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
async def test_read_open_write_gated(client):
    async with client as ac:
        admin = {"Authorization": f"Bearer {_token('admin')}"}
        lectura = {"Authorization": f"Bearer {_token('lectura')}"}
        # lectura puede leer
        assert (await ac.get("/api/task-types", headers=lectura)).status_code == 200
        # lectura NO puede crear
        assert (await ac.post("/api/task-types", json={"name": "X", "color": "#FAC51C", "subtasks": ["a"]}, headers=lectura)).status_code == 403
        # admin crea
        r = await ac.post("/api/task-types", json={"name": "X", "color": "#FAC51C", "subtasks": ["a"]}, headers=admin)
        assert r.status_code == 200
        tid = r.json()["id"]
        assert r.json()["subtasks"] == ["a"] and r.json()["position"] == 0
        # admin edita
        r2 = await ac.patch(f"/api/task-types/{tid}", json={"subtasks": ["a", "b"]}, headers=admin)
        assert r2.status_code == 200 and r2.json()["subtasks"] == ["a", "b"]
        # lectura NO puede borrar
        assert (await ac.delete(f"/api/task-types/{tid}", headers=lectura)).status_code == 403
        # admin borra
        assert (await ac.delete(f"/api/task-types/{tid}", headers=admin)).status_code == 200

@pytest.mark.asyncio
async def test_direccion_can_write(client):
    async with client as ac:
        direccion = {"Authorization": f"Bearer {_token('direccion')}"}
        r = await ac.post("/api/task-types", json={"name": "Y", "color": "#FF7F24", "subtasks": []}, headers=direccion)
        assert r.status_code == 200
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_types_endpoint.py -v`
Expected: FAIL (404, no existe el router).

- [ ] **Step 3: Crear `app/api/task_types.py`**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user, require_permission
from app.auth.models import User
from app.core.db import get_session
from app.gestor.task_types_service import (
    list_task_types, create_task_type, update_task_type, delete_task_type,
)

router = APIRouter(prefix="/api/task-types", tags=["gestor"])

class TaskTypeBody(BaseModel):
    name: str
    color: str = "#FAC51C"
    subtasks: list[str] = []

class TaskTypePatch(BaseModel):
    name: str | None = None
    color: str | None = None
    subtasks: list[str] | None = None

def _tt(tt) -> dict:
    return {"id": str(tt.id), "name": tt.name, "color": tt.color,
            "subtasks": tt.subtasks, "position": tt.position}

@router.get("")
async def listar(user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_session)) -> list[dict]:
    return [_tt(t) for t in await list_task_types(session)]

@router.post("", dependencies=[Depends(require_permission("task_types:write"))])
async def crear(body: TaskTypeBody, session: AsyncSession = Depends(get_session)) -> dict:
    tt = await create_task_type(session, body.name, body.color, body.subtasks)
    return _tt(tt)

@router.patch("/{type_id}", dependencies=[Depends(require_permission("task_types:write"))])
async def actualizar(type_id: uuid.UUID, body: TaskTypePatch,
                     session: AsyncSession = Depends(get_session)) -> dict:
    tt = await update_task_type(session, type_id, name=body.name, color=body.color, subtasks=body.subtasks)
    if tt is None:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")
    return _tt(tt)

@router.delete("/{type_id}", dependencies=[Depends(require_permission("task_types:write"))])
async def borrar(type_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict:
    ok = await delete_task_type(session, type_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")
    return {"deleted": True}
```

- [ ] **Step 4: Registrar el router en `main.py`**

En `app/main.py`: añadir `task_types` al import desde `app.api` (línea 6) y `app.include_router(task_types.router)` junto a los demás.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_types_endpoint.py -v`
Expected: PASS (ambos tests).

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/api/task_types.py app/main.py tests/test_task_types_endpoint.py
git commit -m "feat(gestor): task-types endpoints (read open, write gated by RBAC)"
```

---

### Task 4: Generación de subtareas al crear tarea

**Files:**
- Modify: `idled-backend/app/gestor/service.py` (`create_task` acepta `subtasks`)
- Modify: `idled-backend/app/api/projects.py` (`TaskBody.subtasks`, pasar a `create_task`)
- Test: `idled-backend/tests/test_task_with_subtasks.py`

**Interfaces:**
- Consumes: `create_task`, `Task`.
- Produces: `create_task(..., subtasks: list[str] | None = None)` — crea la tarea y, si `subtasks` no vacío, crea cada nombre como subtarea (`parent_id`=tarea, en orden). `POST /api/projects/{id}/tasks` acepta `subtasks`.

- [ ] **Step 1: Escribir el test que falla**

```python
# idled-backend/tests/test_task_with_subtasks.py
import jwt as pyjwt
import pytest
import httpx
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"

def _token(sub="ext-st", role="administracion"):
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
async def test_create_task_generates_subtasks(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        r = await ac.post(f"/api/projects/{pid}/tasks",
            json={"title": "PPTO cliente", "task_type": "PPTO", "subtasks": ["BOM", "RFQ", "Alta"]}, headers=h)
        assert r.status_code == 200
        tid = r.json()["id"]
        subs = (await ac.get(f"/api/tasks/{tid}/subtasks", headers=h)).json()
        assert [s["title"] for s in subs] == ["BOM", "RFQ", "Alta"]

@pytest.mark.asyncio
async def test_create_task_without_subtasks_unchanged(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        pid = (await ac.post("/api/projects", json={"name": "P2"}, headers=h)).json()["id"]
        tid = (await ac.post(f"/api/projects/{pid}/tasks", json={"title": "sola"}, headers=h)).json()["id"]
        assert (await ac.get(f"/api/tasks/{tid}/subtasks", headers=h)).json() == []
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-backend && docker compose exec -T api pytest tests/test_task_with_subtasks.py -v`
Expected: FAIL (subtasks no se crean → primera aserción falla).

- [ ] **Step 3: Extender `create_task` en `service.py`**

Reemplazar la firma y el final de `create_task` (mantener el resto del cuerpo igual hasta crear la tarea):

```python
async def create_task(
    session: AsyncSession, project_id: uuid.UUID, user_external_id: str, *,
    title: str, task_type: str = "PPTO", status: str = "open",
    assignee: str | None = None, due_date: str | None = None, start_date: str | None = None,
    subtasks: list[str] | None = None,
) -> Task | None:
    if not is_valid_status(status):
        raise ValueError(f"Estado inválido: {status}")
    project = await get_accessible_project(session, project_id, user_external_id)
    if project is None:
        return None
    if assignee is not None and assignee != "" and not await is_project_member(session, project_id, assignee):
        raise ValueError("Asignado no es miembro")
    result = await session.execute(
        select(safunc.max(Task.position)).where(
            Task.project_id == project_id, Task.status == status
        )
    )
    max_pos = result.scalar()
    position = 0 if max_pos is None else max_pos + 1
    task = Task(
        project_id=project_id, title=title, task_type=task_type, status=status,
        assignee=assignee, due_date=due_date, start_date=start_date, position=position,
    )
    session.add(task)
    await session.flush()  # obtiene task.id sin cerrar la transacción
    for i, sub_title in enumerate(subtasks or []):
        name = (sub_title or "").strip()
        if not name:
            continue
        session.add(Task(project_id=project_id, parent_id=task.id, title=name, status="open", position=i))
    await session.commit()
    await session.refresh(task)
    return task
```

- [ ] **Step 4: Añadir `subtasks` al `TaskBody` y pasarlo**

En `app/api/projects.py`, `TaskBody` gana `subtasks: list[str] | None = None`; en `crear_tarea`, pasar `subtasks=body.subtasks` a `create_task`:

```python
class TaskBody(BaseModel):
    title: str
    task_type: str = "PPTO"
    status: str = "open"
    assignee: str | None = None
    due_date: str | None = None
    start_date: str | None = None
    subtasks: list[str] | None = None
```
y en la llamada:
```python
        t = await create_task(
            session, project_id, user.external_id, title=body.title, task_type=body.task_type,
            status=body.status, assignee=body.assignee, due_date=body.due_date,
            start_date=body.start_date, subtasks=body.subtasks,
        )
```

- [ ] **Step 5: Ejecutar y ver que pasa (+ regresión)**

Run:
```bash
cd idled-backend && docker compose exec -T api pytest tests/test_task_with_subtasks.py tests/test_tasks_endpoint.py tests/test_projects_endpoint.py -v
```
Expected: PASS (retrocompat intacta).

- [ ] **Step 6: Commit**

```bash
cd idled-backend && git add app/gestor/service.py app/api/projects.py tests/test_task_with_subtasks.py
git commit -m "feat(gestor): create_task generates subtasks from optional list"
```

---

## Frontend

### Task 5: Data layer (tipos + api + hooks + canManageTypes)

**Files:**
- Modify: `idled-frontend/lib/types.ts` (`TaskType`)
- Modify: `idled-frontend/lib/api.ts` (`listTaskTypes`, `createTaskType`, `updateTaskType`, `deleteTaskType`; `createTask` +subtasks)
- Modify: `idled-frontend/lib/queries.ts` (hooks de tipos + `useQuickCreateTask`)
- Create: `idled-frontend/lib/roles.ts` (`canManageTypes`)
- Test: `idled-frontend/tests/task-types-data.test.tsx`, `idled-frontend/tests/roles.test.ts`

**Interfaces:**
- Produces:
  - `TaskType { id; name; color; subtasks: string[]; position: number }`.
  - api: `listTaskTypes(token)`, `createTaskType(token,{name,color,subtasks})`, `updateTaskType(token,id,patch)`, `deleteTaskType(token,id)`; `createTask` input gana `subtasks?: string[]`.
  - hooks: `useTaskTypes()`, `useCreateTaskType()`, `useUpdateTaskType()`, `useDeleteTaskType()` (invalidan `['task-types']`); `useQuickCreateTask()` (mutación `{projectId,title,task_type,subtasks}` → invalida `['tasks',projectId]`,`['projects']`,`['my-tasks']`).
  - `canManageTypes(role: string | null): boolean` = role ∈ {'admin','direccion'}.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// idled-frontend/tests/roles.test.ts
import { describe, it, expect } from 'vitest'
import { canManageTypes } from '@/lib/roles'
describe('canManageTypes', () => {
  it('admin y direccion pueden', () => {
    expect(canManageTypes('admin')).toBe(true)
    expect(canManageTypes('direccion')).toBe(true)
  })
  it('otros no', () => {
    expect(canManageTypes('lectura')).toBe(false)
    expect(canManageTypes(null)).toBe(false)
  })
})
```

```tsx
// idled-frontend/tests/task-types-data.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTaskTypes } from '@/lib/queries'

beforeEach(() => localStorage.setItem('idled_token', 'h.p.s'))
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useTaskTypes', () => {
  it('lista los tipos', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([{ id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM'], position: 0 }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const { result } = renderHook(() => useTaskTypes(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0].name).toBe('PPTO'))
  })
})
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd idled-frontend && npm test -- roles task-types-data`
Expected: FAIL (módulos/hooks no existen).

- [ ] **Step 3: `lib/roles.ts`**

```ts
export function canManageTypes(role: string | null): boolean {
  return role === 'admin' || role === 'direccion'
}
```

- [ ] **Step 4: Tipos en `lib/types.ts`**

Añadir al final:
```ts
export interface TaskType {
  id: string
  name: string
  color: string
  subtasks: string[]
  position: number
}
```

- [ ] **Step 5: api en `lib/api.ts`**

Añadir `TaskType` al import de tipos; añadir `subtasks?: string[]` al objeto `input` de `createTask`:
```ts
export const createTask = (
  token: string,
  projectId: string,
  input: { title: string; task_type?: string; status?: TaskStatus; assignee?: string | null; due_date?: string | null; start_date?: string | null; subtasks?: string[] },
) => apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: input, token })
```
Añadir al final:
```ts
export const listTaskTypes = (token: string) =>
  apiFetch<TaskType[]>('/api/task-types', { token })
export const createTaskType = (token: string, input: { name: string; color: string; subtasks: string[] }) =>
  apiFetch<TaskType>('/api/task-types', { method: 'POST', body: input, token })
export const updateTaskType = (token: string, id: string, patch: { name?: string; color?: string; subtasks?: string[] }) =>
  apiFetch<TaskType>(`/api/task-types/${id}`, { method: 'PATCH', body: patch, token })
export const deleteTaskType = (token: string, id: string) =>
  apiFetch<{ deleted: boolean }>(`/api/task-types/${id}`, { method: 'DELETE', token })
```

- [ ] **Step 6: hooks en `lib/queries.ts`**

Añadir al final:
```ts
export function useTaskTypes() {
  return useQuery({
    queryKey: ['task-types'],
    queryFn: () => api.listTaskTypes(token()),
    enabled: Boolean(getToken()),
  })
}
export function useCreateTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string; subtasks: string[] }) => api.createTaskType(token(), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useUpdateTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: { name?: string; color?: string; subtasks?: string[] } }) => api.updateTaskType(token(), v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useDeleteTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteTaskType(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useQuickCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { projectId: string; title: string; task_type: string; subtasks?: string[] }) =>
      api.createTask(token(), v.projectId, { title: v.title, task_type: v.task_type, subtasks: v.subtasks }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', v.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })
}
```

- [ ] **Step 7: Ejecutar y ver que pasan (+ suite)**

Run: `cd idled-frontend && npm test -- roles task-types-data` luego `npm test`
Expected: PASS, sin regresión.

- [ ] **Step 8: Commit**

```bash
cd idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts lib/roles.ts tests/roles.test.ts tests/task-types-data.test.tsx
git commit -m "feat: task-types data layer + canManageTypes + quick-create hook"
```

---

### Task 6: `TaskTypesManager` (panel CRUD)

**Files:**
- Create: `idled-frontend/components/dashboard/TaskTypesManager.tsx`
- Test: `idled-frontend/tests/task-types-manager.test.tsx`

**Interfaces:**
- Consumes: `useTaskTypes`, `useCreateTaskType`, `useUpdateTaskType`, `useDeleteTaskType`, `canManageTypes`, `decodeToken`+`getToken`.
- Produces: `export default function TaskTypesManager()`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/task-types-manager.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const updateMutate = vi.fn()
const TYPES = [
  { id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM', 'RFQ'], position: 0 },
  { id: 't2', name: 'MUESTRAS', color: '#FF7F24', subtasks: ['Requisitos'], position: 1 },
]
vi.mock('@/lib/queries', () => ({
  useTaskTypes: () => ({ data: TYPES, isError: false }),
  useCreateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTaskType: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteTaskType: () => ({ mutate: vi.fn(), isPending: false }),
}))
const authState = vi.hoisted(() => ({ role: 'admin' as string }))
vi.mock('@/lib/auth', async (orig) => ({ ...(await orig() as object), getToken: () => 'h.p.s', decodeToken: () => ({ sub: 'u', name: 'U', role: authState.role }) }))

import TaskTypesManager from '@/components/dashboard/TaskTypesManager'
function renderMgr() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><TaskTypesManager /></QueryClientProvider>)
}
beforeEach(() => { updateMutate.mockClear(); authState.role = 'admin' })

describe('TaskTypesManager', () => {
  it('lista tipos y sus subtareas de plantilla', () => {
    renderMgr()
    expect(screen.getByText('PPTO')).toBeTruthy()
    expect(screen.getByText('MUESTRAS')).toBeTruthy()
  })
  it('admin puede añadir una subtarea a la plantilla (llama updateTaskType)', () => {
    renderMgr()
    fireEvent.click(screen.getByText('PPTO')) // seleccionar
    fireEvent.click(screen.getByRole('button', { name: /añadir subtarea/i }))
    expect(updateMutate).toHaveBeenCalled()
    const arg = updateMutate.mock.calls[0][0]
    expect(arg.id).toBe('t1')
    expect(arg.patch.subtasks.length).toBe(3) // BOM, RFQ, + nueva
  })
  it('rol lectura no muestra controles de edición', () => {
    authState.role = 'lectura'
    renderMgr()
    expect(screen.getByText('PPTO')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /añadir subtarea/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /nuevo tipo/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- task-types-manager`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar `components/dashboard/TaskTypesManager.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useTaskTypes, useCreateTaskType, useUpdateTaskType, useDeleteTaskType } from '@/lib/queries'
import { canManageTypes } from '@/lib/roles'
import { getToken, decodeToken } from '@/lib/auth'
import type { TaskType } from '@/lib/types'

const PALETTE = ['#FAC51C', '#FF7F24', '#46C26A', '#4FB6E8', '#E5484D', '#C9A227', '#A9A9A9']

export default function TaskTypesManager() {
  const { data, isError } = useTaskTypes()
  const createType = useCreateTaskType()
  const updateType = useUpdateTaskType()
  const deleteType = useDeleteTaskType()
  const role = decodeToken(getToken())?.role ?? null
  const canManage = canManageTypes(role)
  const types: TaskType[] = Array.isArray(data) ? data : []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = types.find((t) => t.id === selectedId) ?? types[0] ?? null

  function patchSubs(t: TaskType, subs: string[]) {
    updateType.mutate({ id: t.id, patch: { subtasks: subs } })
  }

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <span style={{ width: 7, height: 18, background: 'var(--accent)', borderRadius: 3 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Tipos de tarea y plantillas de subtareas</span>
      </div>
      <div style={{ fontSize: 12, color: '#7a7a7a', marginBottom: 16, paddingLeft: 16 }}>
        Las subtareas de la plantilla se crean automáticamente al usar el tipo.
      </div>
      {isError && <div style={{ color: 'var(--red)', fontSize: 13 }}>No se pudieron cargar los tipos</div>}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* lista de tipos */}
        <div style={{ flex: '0 0 236px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {types.map((t) => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="row-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selected?.id === t.id ? 'rgba(250,197,28,.4)' : 'var(--border)'}`, background: selected?.id === t.id ? 'var(--bg-4)' : 'transparent' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, flex: '0 0 auto' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: selected?.id === t.id ? 700 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <span className="mono" style={{ fontSize: 10.5, color: '#777', background: 'var(--bg-5)', borderRadius: 6, padding: '2px 7px' }}>{t.subtasks.length}</span>
            </div>
          ))}
          {canManage && (
            <button onClick={() => createType.mutate({ name: 'Nuevo tipo', color: PALETTE[types.length % PALETTE.length], subtasks: [] })}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', border: '1px dashed rgba(250,197,28,.35)', borderRadius: 10, color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}>
              + Nuevo tipo de tarea
            </button>
          )}
        </div>

        {/* editor / lectura */}
        {selected && (
          <div style={{ flex: 1, minWidth: 320, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 13, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15 }}>
              <span style={{ width: 13, height: 13, borderRadius: 4, background: selected.color, flex: '0 0 auto' }} />
              {canManage ? (
                <input aria-label="nombre del tipo" defaultValue={selected.name} key={selected.id + selected.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== selected.name) updateType.mutate({ id: selected.id, patch: { name: v } }) }}
                  style={{ flex: 1, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: 'var(--text)', outline: 'none' }} />
              ) : (
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selected.name}</span>
              )}
              {canManage && (
                <button aria-label="eliminar tipo" onClick={() => { deleteType.mutate(selected.id); setSelectedId(null) }}
                  style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(229,72,77,.1)', border: '1px solid rgba(229,72,77,.25)', color: 'var(--red)', cursor: 'pointer', fontSize: 15 }}>×</button>
              )}
            </div>

            {canManage && (
              <>
                <div style={{ fontSize: 10.5, color: '#7a7a7a', fontWeight: 700, letterSpacing: '.05em', marginBottom: 9 }}>COLOR DEL TIPO</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                  {PALETTE.map((c) => (
                    <span key={c} onClick={() => updateType.mutate({ id: selected.id, patch: { color: c } })}
                      role="button" aria-label={`color ${c}`}
                      style={{ width: 26, height: 26, borderRadius: 8, cursor: 'pointer', background: c, boxShadow: selected.color === c ? '0 0 0 2px var(--bg-1), 0 0 0 4px #fff' : 'none' }} />
                  ))}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 11 }}>
              SUBTAREAS DE LA PLANTILLA · {selected.subtasks.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.subtasks.map((s, i) => (
                <div key={i} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 9, background: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid #3a3a3a', flex: '0 0 auto' }} />
                  {canManage ? (
                    <input aria-label={`subtarea ${i + 1}`} defaultValue={s} key={selected.id + '-' + i + '-' + s}
                      onBlur={(e) => { const v = e.target.value; if (v !== s) { const next = [...selected.subtasks]; next[i] = v; patchSubs(selected, next) } }}
                      style={{ flex: 1, background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--text)', outline: 'none', padding: '5px 2px' }} />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13, color: '#d0d0d0' }}>{s}</span>
                  )}
                  {canManage && (
                    <>
                      <button aria-label={`subir ${i + 1}`} disabled={i === 0} onClick={() => { const next = [...selected.subtasks]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; patchSubs(selected, next) }}
                        style={{ background: 'none', border: 'none', color: '#7a7a7a', cursor: 'pointer', fontSize: 11, width: 20 }}>▲</button>
                      <button aria-label={`bajar ${i + 1}`} disabled={i === selected.subtasks.length - 1} onClick={() => { const next = [...selected.subtasks]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; patchSubs(selected, next) }}
                        style={{ background: 'none', border: 'none', color: '#7a7a7a', cursor: 'pointer', fontSize: 11, width: 20 }}>▼</button>
                      <button aria-label={`borrar ${i + 1}`} onClick={() => patchSubs(selected, selected.subtasks.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 15, width: 20 }}>×</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {canManage && (
              <button onClick={() => patchSubs(selected, [...selected.subtasks, 'Nueva subtarea'])}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 9, border: '1px dashed rgba(255,255,255,.12)', borderRadius: 9, color: '#888', fontSize: 12.5, cursor: 'pointer', marginTop: 6, background: 'none', fontFamily: 'inherit', width: '100%' }}>
                + Añadir subtarea a la plantilla
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- task-types-manager`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add components/dashboard/TaskTypesManager.tsx tests/task-types-manager.test.tsx
git commit -m "feat: TaskTypesManager (CRUD of types + subtask templates, RBAC-gated controls)"
```

---

### Task 7: `QuickCreateCard` (crear tarea rápida con auto-subtareas)

**Files:**
- Create: `idled-frontend/components/dashboard/QuickCreateCard.tsx`
- Test: `idled-frontend/tests/quick-create-card.test.tsx`

**Interfaces:**
- Consumes: `useProjects`, `useTaskTypes`, `useQuickCreateTask`.
- Produces: `export default function QuickCreateCard()`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// idled-frontend/tests/quick-create-card.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const createMutate = vi.fn()
vi.mock('@/lib/queries', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'Serie X', color: '#FAC51C' }] }),
  useTaskTypes: () => ({ data: [
    { id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM', 'RFQ'], position: 0 },
    { id: 't2', name: 'MUESTRAS', color: '#FF7F24', subtasks: ['Req'], position: 1 },
  ] }),
  useQuickCreateTask: () => ({ mutate: createMutate, isPending: false }),
}))

import QuickCreateCard from '@/components/dashboard/QuickCreateCard'
function renderCard() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><QuickCreateCard /></QueryClientProvider>)
}
beforeEach(() => createMutate.mockClear())

describe('QuickCreateCard', () => {
  it('previsualiza las subtareas del tipo seleccionado', () => {
    renderCard()
    // PPTO es el primer tipo → su plantilla se previsualiza
    expect(screen.getByText('BOM')).toBeTruthy()
    expect(screen.getByText('RFQ')).toBeTruthy()
  })
  it('crea la tarea con task_type y subtasks', () => {
    renderCard()
    fireEvent.change(screen.getByLabelText('título de la tarea'), { target: { value: 'Presupuesto ACME' } })
    fireEvent.click(screen.getByRole('button', { name: /crear tarea/i }))
    expect(createMutate).toHaveBeenCalled()
    const arg = createMutate.mock.calls[0][0]
    expect(arg.projectId).toBe('p1')
    expect(arg.title).toBe('Presupuesto ACME')
    expect(arg.task_type).toBe('PPTO')
    expect(arg.subtasks).toEqual(['BOM', 'RFQ'])
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- quick-create-card`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar `components/dashboard/QuickCreateCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useProjects, useTaskTypes, useQuickCreateTask } from '@/lib/queries'
import type { Project, TaskType } from '@/lib/types'

export default function QuickCreateCard() {
  const { data: projectsData } = useProjects()
  const { data: typesData } = useTaskTypes()
  const quickCreate = useQuickCreateTask()
  const projects: Project[] = Array.isArray(projectsData) ? projectsData : []
  const types: TaskType[] = Array.isArray(typesData) ? typesData : []

  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [typeName, setTypeName] = useState('')

  const activeProject = projectId || projects[0]?.id || ''
  const activeType = types.find((t) => t.name === (typeName || types[0]?.name)) ?? types[0] ?? null
  const preview = activeType?.subtasks ?? []
  const canCreate = title.trim().length > 0 && Boolean(activeProject) && Boolean(activeType)

  function submit() {
    if (!canCreate || !activeType) return
    quickCreate.mutate({ projectId: activeProject, title: title.trim(), task_type: activeType.name, subtasks: activeType.subtasks })
    setTitle('')
  }

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}>
        <span style={{ width: 7, height: 18, background: 'var(--accent)', borderRadius: 3 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Crear tarea rápida</span>
      </div>

      <input aria-label="título de la tarea" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Escribe el título de la tarea…"
        style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 14px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, marginBottom: 14, outline: 'none' }} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#7a7a7a', fontWeight: 600, marginBottom: 7 }}>PROYECTO</div>
          {projects.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#8a8a8a' }}>Crea un proyecto primero</div>
          ) : (
            <select aria-label="proyecto" value={activeProject} onChange={(e) => setProjectId(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: '#7a7a7a', fontWeight: 600, marginBottom: 7 }}>TIPO DE TAREA</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {types.map((t) => {
              const on = activeType?.id === t.id
              return (
                <span key={t.id} onClick={() => setTypeName(t.name)}
                  style={{ borderRadius: 9, padding: '9px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${on ? t.color : 'var(--border)'}`, background: on ? `${t.color}22` : 'var(--bg-1)', color: on ? t.color : '#c0c0c0' }}>
                  {t.name}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {preview.length > 0 && (
        <div style={{ background: 'var(--bg-1)', border: '1px dashed rgba(250,197,28,.3)', borderRadius: 11, padding: 15, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Subtareas que se crearán automáticamente · {preview.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {preview.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#d5d5d5' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid #3a3a3a', flex: '0 0 auto' }} />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={submit} disabled={!canCreate || quickCreate.isPending}
        style={{ width: '100%', background: canCreate ? 'var(--accent)' : 'var(--bg-5)', color: canCreate ? '#161616' : '#666', border: 'none', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5, cursor: canCreate ? 'pointer' : 'default' }}>
        Crear tarea{preview.length > 0 ? ` y ${preview.length} subtareas` : ''}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd idled-frontend && npm test -- quick-create-card`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd idled-frontend && git add components/dashboard/QuickCreateCard.tsx tests/quick-create-card.test.tsx
git commit -m "feat: QuickCreateCard (create task with auto subtasks from type template)"
```

---

### Task 8: Integrar en el Dashboard + verificación

**Files:**
- Modify: `idled-frontend/app/(app)/dashboard/page.tsx`
- Test: `idled-frontend/tests/dashboard.test.tsx` (ampliar el existente)

**Interfaces:**
- Consumes: `QuickCreateCard` (Task 7), `TaskTypesManager` (Task 6), y lo ya presente (MyTasksCard, ProjectCard, greeting/stats).

- [ ] **Step 1: Ampliar `tests/dashboard.test.tsx`**

Añadir al mock de `@/lib/queries` los hooks que usarán los nuevos componentes montados en la página (`useTaskTypes`, `useQuickCreateTask`, `useCreateTaskType`, `useUpdateTaskType`, `useDeleteTaskType`) devolviendo valores neutros, y una aserción de que el gestor de tipos aparece. Reemplazar el bloque `vi.mock('@/lib/queries', ...)` por:

```tsx
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
  useTaskTypes: () => ({ data: [{ id: 't1', name: 'PPTO', color: '#FAC51C', subtasks: ['BOM'], position: 0 }], isError: false }),
  useQuickCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTaskType: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTaskType: () => ({ mutate: vi.fn(), isPending: false }),
}))
```

Y añadir un tercer test dentro del `describe('Dashboard')`:

```tsx
  it('muestra crear tarea rápida y el gestor de tipos', () => {
    renderPage()
    expect(screen.getByText('Crear tarea rápida')).toBeTruthy()
    expect(screen.getByText('Tipos de tarea y plantillas de subtareas')).toBeTruthy()
  })
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd idled-frontend && npm test -- dashboard`
Expected: FAIL (la página aún no monta QuickCreateCard ni TaskTypesManager).

- [ ] **Step 3: Reescribir el JSX de `app/(app)/dashboard/page.tsx`**

Mantener imports/estado de saludo+stats+crear-proyecto; **añadir** imports de los dos componentes y reordenar el layout. Reemplazar el `return (...)` por:

```tsx
import QuickCreateCard from '@/components/dashboard/QuickCreateCard'
import TaskTypesManager from '@/components/dashboard/TaskTypesManager'
// ...(resto de imports existentes)

  return (
    <div style={{ padding: '28px 30px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 3, color: 'var(--text)' }}>
        {greeting(new Date().getHours())}, {firstName}
      </div>
      <div style={{ color: '#7a7a7a', fontSize: 14, marginBottom: 22 }}>
        Tienes <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.today} tarea{stats.today === 1 ? '' : 's'}</span> para hoy
        {' '}y <span style={{ color: 'var(--red)', fontWeight: 600 }}>{stats.overdue} atrasada{stats.overdue === 1 ? '' : 's'}</span>.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, marginBottom: 22 }}>
        <QuickCreateCard />
        <MyTasksCard />
      </div>

      <TaskTypesManager />

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
```

- [ ] **Step 4: Ejecutar la suite completa**

Run: `cd idled-frontend && npm test`
Expected: PASS (todos, incluidos los nuevos). Si algo rompe, ajustar mínimamente.

- [ ] **Step 5: Verificación en vivo (controlador)**

Con el stack levantado; reiniciar api para recoger el nuevo router/endpoints y la migración:
```bash
cd idled-backend && docker compose exec -T api alembic upgrade head && docker compose restart api
```
Login `admin@idled.test`, en `/dashboard` verificar: card "Crear tarea rápida" con chips PPTO/MUESTRAS/NUEVO DISEÑO (semilla), previsualización de subtareas al elegir tipo; crear una tarea → aparece en el proyecto con sus subtareas; gestor de tipos: seleccionar PPTO, añadir/editar/reordenar una subtarea (persiste). Con un usuario de rol `lectura` (p.ej. probar el 403): los controles de edición no aparecen.

- [ ] **Step 6: Commit**

```bash
cd idled-frontend && git add "app/(app)/dashboard/page.tsx" tests/dashboard.test.tsx
git commit -m "feat: mount QuickCreateCard + TaskTypesManager in dashboard (design layout)"
```

---

## Notas de verificación final del bloque

- Backend: `docker compose exec -T api pytest tests/test_task_type_model.py tests/test_task_types_service.py tests/test_task_types_endpoint.py tests/test_task_with_subtasks.py -v` verde.
- Frontend: `npm test` verde.
- Manual: los puntos del Task 8 Step 5 (incluida la semilla de 3 tipos y el gating por rol).
- Al terminar: rama `feature/tipos-tarea` en ambos repos → decidir merge con el usuario. Con esto **el Bloque 2 (Dashboard) queda completo**; siguiente sería el Bloque 3 (Proyecto enriquecido).
