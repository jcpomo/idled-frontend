# Chat de equipo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat de equipo en tiempo real con dos superficies — un canal global (todos los autenticados) y uno por proyecto (dueño+miembros) — vía WebSocket para el vivo y REST para el historial.

**Architecture:** Una tabla `ChatMessage` con campo `scope` sirve a ambas superficies. El backend expone REST de historial + endpoints WebSocket; un `ConnectionManager` en memoria hace el fan-out por "sala" (`global` / `project:{id}`) y calcula `mine` por-socket. El frontend abre el WS con un helper con reconexión, lo envuelve en `useTeamChat`, y lo pinta en una página global `/chat` y en un panel drawer dentro del proyecto.

**Tech Stack:** Backend FastAPI async + SQLAlchemy 2 async + Alembic + Postgres (tests pytest en Docker, SQLite en memoria). Frontend Next.js 14.2 App Router + React 18 + TS + @tanstack/react-query (tests vitest en host). WebSocket nativo del navegador.

## Global Constraints

- **Dos superficies, una tabla:** `ChatMessage.scope` ∈ {`"global"`, `"project"`}; `project_id` con valor solo si `scope=="project"`.
- **Acceso:** global = cualquier usuario autenticado; proyecto = `get_accessible_project(session, project_id, user.external_id)` (dueño OR miembro), ajeno → **404** en REST / cierre **4403** en WS. Token WS inválido/ausente → cierre **4401**.
- **`mine` server-side**, calculado **por-socket** en el broadcast (el cliente nunca decodifica el JWT).
- **Solo enviar + leer.** Sin editar/borrar, sin no-leídos, sin typing/presencia.
- **Contenido:** trim; se ignora (no persiste, no broadcast) si vacío o `len > 2000`.
- **Snapshot de autor:** `author_name = user.name or user.external_id` al enviar (como `TaskComment.author_name`).
- **Orden determinista:** `created_at` con `server_default=func.now()` + `default=lambda: datetime.now(timezone.utc)` (patrón Notification/Ai*).
- **Migración:** `down_revision = "d0e2f4a6b8c1"` (head actual = notifications).
- **Sesión del WS:** usar `Depends(get_session)` (una sesión por conexión, con `commit` por mensaje) — NO `async_session_maker` por operación; así los tests pueden sobreescribir `get_session` y la lógica queda testeable.
- **No `git add -A`.** Cada tarea commitea solo los archivos que lista. El repo backend tiene `*.egg-info/` y el frontend tiene `.superpowers/` que NO deben commitearse.
- **Comandos:** backend `docker compose run --rm api pytest <ruta>`; frontend `npx vitest run <ruta>` en el host.

---

### Task 1: Backend — modelo `ChatMessage` + migración + servicio

**Repo:** `idled-backend`

**Files:**
- Create: `app/team_chat/__init__.py` (vacío)
- Create: `app/team_chat/models.py`
- Create: `app/team_chat/service.py`
- Create: `migrations/versions/a1b3c5d7e9f2_chat_messages.py`
- Modify: `tests/conftest.py` (registrar el modelo)
- Test: `tests/test_team_chat_service.py`

**Interfaces:**
- Produces:
  - `ChatMessage` (modelo) con columnas `id, scope, project_id, author_external_id, author_name, content, created_at`.
  - `async create_message(session, *, scope: str, project_id: uuid.UUID | None, author_external_id: str, author_name: str, content: str) -> ChatMessage`
  - `async list_global_messages(session, limit: int = 50) -> list[ChatMessage]` (orden ascendente por `created_at`, solo los `limit` más recientes)
  - `async list_project_messages(session, project_id: uuid.UUID, limit: int = 50) -> list[ChatMessage]`

- [ ] **Step 1: Write the failing test** — crear `tests/test_team_chat_service.py`

```python
import uuid
import pytest
from app.team_chat.service import create_message, list_global_messages, list_project_messages


@pytest.mark.asyncio
async def test_global_messages_listed_in_order(session):
    for c in ["uno", "dos", "tres"]:
        await create_message(session, scope="global", project_id=None,
                             author_external_id="ext-1", author_name="A", content=c)
    msgs = await list_global_messages(session)
    assert [m.content for m in msgs] == ["uno", "dos", "tres"]
    assert all(m.scope == "global" for m in msgs)


@pytest.mark.asyncio
async def test_project_messages_isolated_by_project(session):
    p1, p2 = uuid.uuid4(), uuid.uuid4()
    await create_message(session, scope="project", project_id=p1,
                         author_external_id="ext-1", author_name="A", content="en p1")
    await create_message(session, scope="project", project_id=p2,
                         author_external_id="ext-1", author_name="A", content="en p2")
    msgs = await list_project_messages(session, p1)
    assert [m.content for m in msgs] == ["en p1"]


@pytest.mark.asyncio
async def test_global_and_project_do_not_mix(session):
    p1 = uuid.uuid4()
    await create_message(session, scope="global", project_id=None,
                         author_external_id="ext-1", author_name="A", content="global")
    await create_message(session, scope="project", project_id=p1,
                         author_external_id="ext-1", author_name="A", content="proyecto")
    assert [m.content for m in await list_global_messages(session)] == ["global"]
    assert [m.content for m in await list_project_messages(session, p1)] == ["proyecto"]


@pytest.mark.asyncio
async def test_limit_returns_most_recent(session):
    for i in range(5):
        await create_message(session, scope="global", project_id=None,
                             author_external_id="ext-1", author_name="A", content=f"m{i}")
    msgs = await list_global_messages(session, limit=2)
    assert [m.content for m in msgs] == ["m3", "m4"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_team_chat_service.py -v`
Expected: FAIL (ModuleNotFoundError: `app.team_chat.service`).

- [ ] **Step 3: Create the package + model**

Create `app/team_chat/__init__.py` empty. Create `app/team_chat/models.py`:

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, Uuid, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scope: Mapped[str] = mapped_column(String)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    author_external_id: Mapped[str] = mapped_column(String)
    author_name: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )
    __table_args__ = (
        Index("ix_chat_messages_scope_project_created", "scope", "project_id", "created_at"),
    )
```

- [ ] **Step 4: Create the service** — `app/team_chat/service.py`

```python
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.team_chat.models import ChatMessage


async def create_message(
    session: AsyncSession, *, scope: str, project_id: uuid.UUID | None,
    author_external_id: str, author_name: str, content: str,
) -> ChatMessage:
    msg = ChatMessage(
        scope=scope, project_id=project_id,
        author_external_id=author_external_id, author_name=author_name, content=content,
    )
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return msg


async def list_global_messages(session: AsyncSession, limit: int = 50) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage).where(ChatMessage.scope == "global")
        .order_by(ChatMessage.created_at.desc()).limit(limit)
    )
    return list(reversed(result.scalars().all()))


async def list_project_messages(
    session: AsyncSession, project_id: uuid.UUID, limit: int = 50,
) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage).where(
            ChatMessage.scope == "project", ChatMessage.project_id == project_id,
        ).order_by(ChatMessage.created_at.desc()).limit(limit)
    )
    return list(reversed(result.scalars().all()))
```

- [ ] **Step 5: Register the model in conftest** — en `tests/conftest.py`, tras la línea de notifications, añade:

```python
import app.team_chat.models  # noqa: F401 — registers ChatMessage with Base.metadata
```

- [ ] **Step 6: Create the migration** — `migrations/versions/a1b3c5d7e9f2_chat_messages.py`

```python
"""chat_messages

Revision ID: a1b3c5d7e9f2
Revises: d0e2f4a6b8c1
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b3c5d7e9f2'
down_revision: Union[str, Sequence[str], None] = 'd0e2f4a6b8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('scope', sa.String(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=True),
        sa.Column('author_external_id', sa.String(), nullable=False),
        sa.Column('author_name', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chat_messages_scope_project_created', 'chat_messages',
                    ['scope', 'project_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_chat_messages_scope_project_created', table_name='chat_messages')
    op.drop_table('chat_messages')
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_team_chat_service.py -v`
Expected: PASS (4 tests).

- [ ] **Step 8: Apply the migration**

Run: `docker compose run --rm api alembic upgrade head`
Expected: aplica `a1b3c5d7e9f2` sin error.

- [ ] **Step 9: Commit**

```bash
git add app/team_chat/__init__.py app/team_chat/models.py app/team_chat/service.py \
        migrations/versions/a1b3c5d7e9f2_chat_messages.py tests/conftest.py tests/test_team_chat_service.py
git commit -m "feat: chat message model, service, and migration"
```

---

### Task 2: Backend — ConnectionManager + REST de historial

**Repo:** `idled-backend`

**Files:**
- Create: `app/team_chat/manager.py`
- Create: `app/api/team_chat.py` (solo REST en esta tarea; la Tarea 3 añade WS al mismo archivo)
- Modify: `app/main.py` (registrar el router)
- Test: `tests/test_team_chat_manager.py`, `tests/test_team_chat_rest.py`

**Interfaces:**
- Consumes (Tarea 1): `create_message`, `list_global_messages`, `list_project_messages`.
- Consumes (existente): `get_accessible_project(session, project_id, user_external_id) -> Project | None` de `app.gestor.service`; `get_current_user` de `app.auth.dependencies`; `get_session` de `app.core.db`.
- Produces:
  - `Connection` (dataclass con `websocket`, `user_external_id`).
  - `ConnectionManager` con `connect(room_key, websocket, user_external_id) -> Connection`, `disconnect(room_key, conn)`, `async broadcast(room_key, message: dict)`; instancia módulo-única `manager`.
  - Router `router` con prefix `/api/team-chat` y `_message_dict(m, current_external_id) -> dict`.

- [ ] **Step 1: Write the failing manager test** — `tests/test_team_chat_manager.py`

```python
import pytest
from app.team_chat.manager import ConnectionManager


class FakeWS:
    def __init__(self):
        self.sent = []
    async def send_json(self, data):
        self.sent.append(data)


@pytest.mark.asyncio
async def test_broadcast_sets_mine_per_socket():
    mgr = ConnectionManager()
    ws_a, ws_b = FakeWS(), FakeWS()
    mgr.connect("global", ws_a, "ext-a")
    mgr.connect("global", ws_b, "ext-b")
    await mgr.broadcast("global", {"id": "1", "content": "hola", "author_external_id": "ext-a"})
    assert ws_a.sent[0]["mine"] is True
    assert ws_b.sent[0]["mine"] is False
    assert ws_b.sent[0]["content"] == "hola"


@pytest.mark.asyncio
async def test_disconnect_removes_connection():
    mgr = ConnectionManager()
    ws = FakeWS()
    conn = mgr.connect("global", ws, "ext-a")
    mgr.disconnect("global", conn)
    await mgr.broadcast("global", {"id": "1", "content": "x", "author_external_id": "ext-a"})
    assert ws.sent == []


@pytest.mark.asyncio
async def test_rooms_are_isolated():
    mgr = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    mgr.connect("global", a, "ext-a")
    mgr.connect("project:1", b, "ext-b")
    await mgr.broadcast("global", {"id": "1", "content": "hi", "author_external_id": "ext-a"})
    assert len(a.sent) == 1 and b.sent == []


@pytest.mark.asyncio
async def test_failed_socket_is_dropped_others_still_receive():
    mgr = ConnectionManager()
    class BoomWS(FakeWS):
        async def send_json(self, data):
            raise RuntimeError("broken")
    good, bad = FakeWS(), BoomWS()
    mgr.connect("global", good, "ext-good")
    mgr.connect("global", bad, "ext-bad")
    await mgr.broadcast("global", {"id": "1", "content": "hi", "author_external_id": "ext-x"})
    assert len(good.sent) == 1
    await mgr.broadcast("global", {"id": "2", "content": "again", "author_external_id": "ext-x"})
    assert len(good.sent) == 2  # bad fue eliminado, no rompe el broadcast
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm api pytest tests/test_team_chat_manager.py -v`
Expected: FAIL (ModuleNotFoundError: `app.team_chat.manager`).

- [ ] **Step 3: Create the manager** — `app/team_chat/manager.py`

```python
from dataclasses import dataclass
from typing import Any


@dataclass(eq=False)
class Connection:
    websocket: Any
    user_external_id: str


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[Connection]] = {}

    def connect(self, room_key: str, websocket: Any, user_external_id: str) -> Connection:
        conn = Connection(websocket=websocket, user_external_id=user_external_id)
        self._rooms.setdefault(room_key, set()).add(conn)
        return conn

    def disconnect(self, room_key: str, conn: Connection) -> None:
        room = self._rooms.get(room_key)
        if not room:
            return
        room.discard(conn)
        if not room:
            self._rooms.pop(room_key, None)

    async def broadcast(self, room_key: str, message: dict) -> None:
        room = self._rooms.get(room_key, set())
        dead: list[Connection] = []
        for conn in list(room):
            payload = {**message, "mine": message["author_external_id"] == conn.user_external_id}
            try:
                await conn.websocket.send_json(payload)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.disconnect(room_key, conn)


manager = ConnectionManager()
```

Note: `@dataclass(eq=False)` para que las instancias `Connection` sean hashables por identidad (van en un `set`).

- [ ] **Step 4: Run the manager test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_team_chat_manager.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing REST test** — `tests/test_team_chat_rest.py`

```python
import pytest
import httpx
import jwt as pyjwt
from app.core.db import get_session

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"


def _token(sub="ext-7", role="administracion", name="Q"):
    return pyjwt.encode({"sub": sub, "role": role, "name": name}, SECRET, algorithm="HS256")


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
async def test_global_history_lists_messages_with_mine(client, session):
    from app.team_chat.service import create_message
    await create_message(session, scope="global", project_id=None,
                         author_external_id="ext-7", author_name="Q", content="hola equipo")
    await create_message(session, scope="global", project_id=None,
                         author_external_id="ext-other", author_name="Z", content="buenas")
    async with client as ac:
        r = await ac.get("/api/team-chat/global/messages",
                         headers={"Authorization": f"Bearer {_token(sub='ext-7')}"})
        assert r.status_code == 200
        body = r.json()
        assert [m["content"] for m in body] == ["hola equipo", "buenas"]
        assert body[0]["mine"] is True    # autor == ext-7
        assert body[1]["mine"] is False


@pytest.mark.asyncio
async def test_project_history_owner_ok_intruder_404(client):
    async with client as ac:
        pid = (await ac.post("/api/projects", json={"name": "P"},
               headers={"Authorization": f"Bearer {_token(sub='owner')}"})).json()["id"]
        r_owner = await ac.get(f"/api/team-chat/projects/{pid}/messages",
                  headers={"Authorization": f"Bearer {_token(sub='owner')}"})
        assert r_owner.status_code == 200
        r_intruder = await ac.get(f"/api/team-chat/projects/{pid}/messages",
                     headers={"Authorization": f"Bearer {_token(sub='intruder')}"})
        assert r_intruder.status_code == 404
```

- [ ] **Step 6: Run it to verify it fails**

Run: `docker compose run --rm api pytest tests/test_team_chat_rest.py -v`
Expected: FAIL (404 en `/api/team-chat/global/messages` — router no existe).

- [ ] **Step 7: Create the REST router** — `app/api/team_chat.py`

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.db import get_session
from app.gestor.service import get_accessible_project
from app.team_chat.service import list_global_messages, list_project_messages

router = APIRouter(prefix="/api/team-chat", tags=["team-chat"])


def _message_dict(m, current_external_id: str) -> dict:
    return {
        "id": str(m.id),
        "scope": m.scope,
        "project_id": str(m.project_id) if m.project_id else None,
        "author_external_id": m.author_external_id,
        "author_name": m.author_name,
        "content": m.content,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "mine": m.author_external_id == current_external_id,
    }


@router.get("/global/messages")
async def global_history(user: User = Depends(get_current_user),
                         session: AsyncSession = Depends(get_session)) -> list[dict]:
    msgs = await list_global_messages(session)
    return [_message_dict(m, user.external_id) for m in msgs]


@router.get("/projects/{project_id}/messages")
async def project_history(project_id: uuid.UUID, user: User = Depends(get_current_user),
                          session: AsyncSession = Depends(get_session)) -> list[dict]:
    project = await get_accessible_project(session, project_id, user.external_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    msgs = await list_project_messages(session, project_id)
    return [_message_dict(m, user.external_id) for m in msgs]
```

- [ ] **Step 8: Register the router** — en `app/main.py`, añade `team_chat` al import de routers `from app.api import ...` y, junto a los demás `app.include_router(...)`, añade:

```python
app.include_router(team_chat.router)
```

- [ ] **Step 9: Run the REST tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_team_chat_rest.py -v`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add app/team_chat/manager.py app/api/team_chat.py app/main.py \
        tests/test_team_chat_manager.py tests/test_team_chat_rest.py
git commit -m "feat: connection manager and team-chat history endpoints"
```

---

### Task 3: Backend — endpoints WebSocket (global + proyecto)

**Repo:** `idled-backend`

**Files:**
- Modify: `app/api/team_chat.py` (añadir la lógica WS y las dos rutas `@router.websocket`)
- Test: `tests/test_team_chat_ws.py`

**Interfaces:**
- Consumes: `manager` (Tarea 2), `create_message` (Tarea 1), `get_accessible_project` (existente), `decode_token`/`InvalidTokenError` de `app.auth.jwt`, `upsert_user` de `app.auth.service`, `get_session` de `app.core.db`.
- Produces:
  - `async authorize_socket(ws, session, token: str | None, scope: str, project_id: uuid.UUID | None) -> User | None` — hace `accept()`, valida token y acceso; en fallo cierra (4401 token, 4403 acceso) y devuelve `None`.
  - `async run_chat_socket(ws, session, user, room_key: str, scope: str, project_id: uuid.UUID | None) -> None` — registra en el manager, bucle recibir/validar/persistir/broadcast, limpia al desconectar.
  - Rutas `@router.websocket("/global/ws")` y `@router.websocket("/projects/{project_id}/ws")`.

**Contexto de diseño:** el `accept()` se hace ANTES de validar (para poder cerrar con códigos personalizados 4401/4403). La lógica va en dos corutinas para poder testearla con un `FakeWebSocket` en el mismo loop async, sin `TestClient` (que corre en otro loop y rompería la sesión SQLite en memoria compartida).

- [ ] **Step 1: Write the failing WS test** — `tests/test_team_chat_ws.py`

```python
import uuid
import pytest
import jwt as pyjwt
from fastapi import WebSocketDisconnect
from app.api.team_chat import authorize_socket, run_chat_socket
from app.team_chat.manager import manager

SECRET = "test-secret-which-is-long-enough-to-avoid-pyjwt-key-warnings-0123456789"


def _token(sub="ext-1", name="Ana"):
    return pyjwt.encode({"sub": sub, "role": "administracion", "name": name}, SECRET, algorithm="HS256")


class FakeWS:
    def __init__(self, incoming=None):
        self.accepted = False
        self.closed_code = None
        self.sent = []
        self._incoming = list(incoming or [])
    async def accept(self):
        self.accepted = True
    async def close(self, code=1000):
        self.closed_code = code
    async def send_json(self, data):
        self.sent.append(data)
    async def receive_json(self):
        if self._incoming:
            return self._incoming.pop(0)
        raise WebSocketDisconnect()


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    from app.core.config import get_settings
    get_settings.cache_clear()
    manager._rooms.clear()
    yield
    manager._rooms.clear()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_valid_token_sends_and_broadcasts_mine_true(session):
    ws = FakeWS(incoming=[{"content": "hola"}])
    user = await authorize_socket(ws, session, _token(sub="ext-1"), "global", None)
    assert user is not None and ws.accepted and ws.closed_code is None
    await run_chat_socket(ws, session, user, "global", "global", None)
    assert len(ws.sent) == 1
    assert ws.sent[0]["content"] == "hola"
    assert ws.sent[0]["mine"] is True
    assert ws.sent[0]["author_name"] == "Ana"


@pytest.mark.asyncio
async def test_two_clients_receive_with_per_socket_mine(session):
    listener = FakeWS()
    manager.connect("global", listener, "ext-b")
    sender = FakeWS(incoming=[{"content": "hey"}])
    user = await authorize_socket(sender, session, _token(sub="ext-a"), "global", None)
    await run_chat_socket(sender, session, user, "global", "global", None)
    assert sender.sent[0]["mine"] is True
    assert listener.sent[0]["mine"] is False
    assert listener.sent[0]["content"] == "hey"


@pytest.mark.asyncio
async def test_missing_token_closes_4401(session):
    ws = FakeWS()
    user = await authorize_socket(ws, session, None, "global", None)
    assert user is None and ws.closed_code == 4401


@pytest.mark.asyncio
async def test_invalid_token_closes_4401(session):
    ws = FakeWS()
    user = await authorize_socket(ws, session, "garbage", "global", None)
    assert user is None and ws.closed_code == 4401


@pytest.mark.asyncio
async def test_non_member_project_closes_4403(session):
    ws = FakeWS()
    user = await authorize_socket(ws, session, _token(sub="ext-nomember"), "project", uuid.uuid4())
    assert user is None and ws.closed_code == 4403


@pytest.mark.asyncio
async def test_empty_and_oversized_messages_ignored(session):
    from app.team_chat.service import list_global_messages
    ws = FakeWS(incoming=[{"content": "   "}, {"content": "x" * 2001}])
    user = await authorize_socket(ws, session, _token(sub="ext-1"), "global", None)
    await run_chat_socket(ws, session, user, "global", "global", None)
    assert ws.sent == []
    assert await list_global_messages(session) == []
```

- [ ] **Step 2: Run it to verify it fails**

Run: `docker compose run --rm api pytest tests/test_team_chat_ws.py -v`
Expected: FAIL (ImportError: `authorize_socket` no existe en `app.api.team_chat`).

- [ ] **Step 3: Add the WS logic + routes to `app/api/team_chat.py`**

Añade estos imports arriba (junto a los existentes):

```python
from fastapi import WebSocket, WebSocketDisconnect
from app.auth.jwt import InvalidTokenError, decode_token
from app.auth.service import upsert_user
from app.team_chat.manager import manager
from app.team_chat.service import create_message
```

Y al final del archivo:

```python
MAX_CONTENT = 2000


async def authorize_socket(ws, session, token: str | None, scope: str,
                           project_id: uuid.UUID | None):
    await ws.accept()
    if not token:
        await ws.close(code=4401)
        return None
    try:
        payload = decode_token(token)
    except InvalidTokenError:
        await ws.close(code=4401)
        return None
    user = await upsert_user(session, payload)
    if scope == "project":
        project = await get_accessible_project(session, project_id, user.external_id)
        if project is None:
            await ws.close(code=4403)
            return None
    return user


async def run_chat_socket(ws, session, user, room_key: str, scope: str,
                          project_id: uuid.UUID | None) -> None:
    conn = manager.connect(room_key, ws, user.external_id)
    try:
        while True:
            data = await ws.receive_json()
            content = (data.get("content") or "").strip()
            if not content or len(content) > MAX_CONTENT:
                continue
            msg = await create_message(
                session, scope=scope, project_id=project_id,
                author_external_id=user.external_id,
                author_name=user.name or user.external_id, content=content,
            )
            await manager.broadcast(room_key, {
                "id": str(msg.id), "scope": msg.scope,
                "project_id": str(msg.project_id) if msg.project_id else None,
                "author_external_id": msg.author_external_id,
                "author_name": msg.author_name, "content": msg.content,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            })
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_key, conn)


@router.websocket("/global/ws")
async def global_ws(ws: WebSocket, session: AsyncSession = Depends(get_session)):
    token = ws.query_params.get("token")
    user = await authorize_socket(ws, session, token, "global", None)
    if user is None:
        return
    await run_chat_socket(ws, session, user, "global", "global", None)


@router.websocket("/projects/{project_id}/ws")
async def project_ws(project_id: uuid.UUID, ws: WebSocket,
                     session: AsyncSession = Depends(get_session)):
    token = ws.query_params.get("token")
    user = await authorize_socket(ws, session, token, "project", project_id)
    if user is None:
        return
    await run_chat_socket(ws, session, user, f"project:{project_id}", "project", project_id)
```

- [ ] **Step 4: Run the WS tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_team_chat_ws.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the whole team-chat backend suite (regression guard)**

Run: `docker compose run --rm api pytest tests/test_team_chat_service.py tests/test_team_chat_manager.py tests/test_team_chat_rest.py tests/test_team_chat_ws.py -v`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add app/api/team_chat.py tests/test_team_chat_ws.py
git commit -m "feat: team-chat websocket endpoints (global + per-project)"
```

---

### Task 4: Frontend — tipo `ChatMessage` + api + helper `openChatSocket`

**Repo:** `idled-frontend`

**Files:**
- Modify: `lib/types.ts` (+`ChatMessage`)
- Modify: `lib/api.ts` (+`listGlobalMessages`, +`listProjectMessages`; añadir `ChatMessage` al import de tipos)
- Create: `lib/teamChat.ts` (`wsBase`, `openChatSocket`)
- Test: `tests/team-chat-socket.test.ts`

**Interfaces:**
- Consumes (backend): GET `/api/team-chat/global/messages`, GET `/api/team-chat/projects/{id}/messages`; WS `/api/team-chat/global/ws?token=` y `/api/team-chat/projects/{id}/ws?token=`.
- Produces:
  - `ChatMessage { id, scope, project_id, author_external_id, author_name, content, created_at, mine }`.
  - `listGlobalMessages(token)`, `listProjectMessages(token, projectId)`.
  - `wsBase(): string`; `type ChatStatus = 'connecting'|'open'|'closed'|'unauthorized'`.
  - `openChatSocket(scope, projectId, { onMessage, onStatus? }) -> { send(content), close() }`.

- [ ] **Step 1: Write the failing helper test** — `tests/team-chat-socket.test.ts`

```typescript
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openChatSocket } from '@/lib/teamChat'
import * as auth from '@/lib/auth'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  url: string
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  emitOpen() { this.readyState = 1; this.onopen?.() }
  emitMessage(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  emitClose(code: number) { this.onclose?.({ code }) }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket as never)
  vi.spyOn(auth, 'getToken').mockReturnValue('tok123')
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('connects to the correct URL with token', () => {
  openChatSocket('global', null, { onMessage: vi.fn() })
  expect(FakeWebSocket.instances[0].url).toContain('/api/team-chat/global/ws?token=tok123')
})

it('builds the project URL', () => {
  openChatSocket('project', 'p1', { onMessage: vi.fn() })
  expect(FakeWebSocket.instances[0].url).toContain('/api/team-chat/projects/p1/ws?token=tok123')
})

it('parses incoming messages', () => {
  const onMessage = vi.fn()
  openChatSocket('global', null, { onMessage })
  FakeWebSocket.instances[0].emitMessage({ id: 'm1', content: 'hi' })
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', content: 'hi' }))
})

it('sends JSON-wrapped content when open', () => {
  const sock = openChatSocket('global', null, { onMessage: vi.fn() })
  FakeWebSocket.instances[0].emitOpen()
  sock.send('hola')
  expect(FakeWebSocket.instances[0].sent[0]).toBe(JSON.stringify({ content: 'hola' }))
})

it('reconnects after a network close', () => {
  openChatSocket('global', null, { onMessage: vi.fn() })
  FakeWebSocket.instances[0].emitClose(1006)
  vi.advanceTimersByTime(1000)
  expect(FakeWebSocket.instances.length).toBe(2)
})

it('does NOT reconnect on auth close (4401) and reports unauthorized', () => {
  const onStatus = vi.fn()
  openChatSocket('global', null, { onMessage: vi.fn(), onStatus })
  FakeWebSocket.instances[0].emitClose(4401)
  vi.advanceTimersByTime(10000)
  expect(FakeWebSocket.instances.length).toBe(1)
  expect(onStatus).toHaveBeenCalledWith('unauthorized')
})

it('does not reconnect after we close it', () => {
  const sock = openChatSocket('global', null, { onMessage: vi.fn() })
  sock.close()
  FakeWebSocket.instances[0].emitClose(1006)
  vi.advanceTimersByTime(5000)
  expect(FakeWebSocket.instances.length).toBe(1)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/team-chat-socket.test.ts`
Expected: FAIL (no existe `@/lib/teamChat`).

- [ ] **Step 3: Add the type** — en `lib/types.ts` añade:

```typescript
export interface ChatMessage {
  id: string
  scope: string
  project_id: string | null
  author_external_id: string
  author_name: string
  content: string
  created_at: string
  mine: boolean
}
```

- [ ] **Step 4: Add the api functions** — en `lib/api.ts`, añade `ChatMessage` al import de tipos existente (`import type { ..., ChatMessage } from './types'`) y, junto a las demás funciones, añade:

```typescript
export const listGlobalMessages = (token: string) =>
  apiFetch<ChatMessage[]>('/api/team-chat/global/messages', { token })

export const listProjectMessages = (token: string, projectId: string) =>
  apiFetch<ChatMessage[]>(`/api/team-chat/projects/${projectId}/messages`, { token })
```

- [ ] **Step 5: Create the socket helper** — `lib/teamChat.ts`

```typescript
import { apiBase } from './api'
import { getToken } from './auth'
import type { ChatMessage } from './types'

export type ChatStatus = 'connecting' | 'open' | 'closed' | 'unauthorized'

export function wsBase(): string {
  return apiBase().replace(/^http/, 'ws')
}

interface Handlers {
  onMessage: (msg: ChatMessage) => void
  onStatus?: (status: ChatStatus) => void
}

const MAX_RETRIES = 5

export function openChatSocket(
  scope: 'global' | 'project', projectId: string | null, handlers: Handlers,
): { send: (content: string) => void; close: () => void } {
  const path = scope === 'global'
    ? '/api/team-chat/global/ws'
    : `/api/team-chat/projects/${projectId}/ws`
  let ws: WebSocket | null = null
  let closedByUs = false
  let retries = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    handlers.onStatus?.('connecting')
    const token = getToken() ?? ''
    ws = new WebSocket(`${wsBase()}${path}?token=${encodeURIComponent(token)}`)
    ws.onopen = () => { retries = 0; handlers.onStatus?.('open') }
    ws.onmessage = (e) => {
      try { handlers.onMessage(JSON.parse(e.data)) } catch { /* ignora frames malformados */ }
    }
    ws.onclose = (e) => {
      if (closedByUs) return
      if (e.code === 4401 || e.code === 4403) { handlers.onStatus?.('unauthorized'); return }
      handlers.onStatus?.('closed')
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 10000)
        retries += 1
        retryTimer = setTimeout(connect, delay)
      }
    }
  }
  connect()

  return {
    send: (content: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ content }))
      }
    },
    close: () => {
      closedByUs = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    },
  }
}
```

- [ ] **Step 6: Run the helper test to verify it passes**

Run: `npx vitest run tests/team-chat-socket.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/api.ts lib/teamChat.ts tests/team-chat-socket.test.ts
git commit -m "feat: ChatMessage type, history api, and websocket helper"
```

---

### Task 5: Frontend — hook `useTeamChat`

**Repo:** `idled-frontend`

**Files:**
- Modify: `lib/teamChat.ts` (+`useTeamChat`)
- Test: `tests/use-team-chat.test.tsx`

**Interfaces:**
- Consumes: `openChatSocket` (Tarea 4, mismo archivo), `listGlobalMessages`/`listProjectMessages` (Tarea 4), `getToken`.
- Produces: `useTeamChat(scope: 'global'|'project', projectId?: string) -> { messages: ChatMessage[], status: ChatStatus, send: (content: string) => void }`. Carga el historial, abre el socket, acumula mensajes vivos con dedup por `id`, y cierra el socket al desmontar.

- [ ] **Step 1: Write the failing hook test** — `tests/use-team-chat.test.tsx`

```typescript
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTeamChat } from '@/lib/teamChat'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  sent: string[] = []
  constructor(_url: string) { FakeWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  emitMessage(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
}

const msg = (id: string, extra: Record<string, unknown> = {}) => ({
  id, scope: 'global', project_id: null, author_external_id: 'x', author_name: 'X',
  content: `c-${id}`, created_at: '', mine: false, ...extra,
})

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket as never)
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
})
afterEach(() => vi.restoreAllMocks())

it('seeds messages from history then appends live', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([msg('h1')] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m2')) })
  await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['h1', 'm2']))
})

it('dedups a live message already present by id', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m1')) })
  act(() => { FakeWebSocket.instances[0].emitMessage(msg('m1')) })
  await waitFor(() => expect(result.current.messages).toHaveLength(1))
})

it('send delegates to the socket', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
  act(() => { result.current.send('hola') })
  expect(FakeWebSocket.instances[0].sent[0]).toBe(JSON.stringify({ content: 'hola' }))
})

it('loads project history when scope is project', async () => {
  const spy = vi.spyOn(api, 'listProjectMessages').mockResolvedValue([] as never)
  renderHook(() => useTeamChat('project', 'p1'))
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', 'p1'))
})

it('closes the socket on unmount', async () => {
  vi.spyOn(api, 'listGlobalMessages').mockResolvedValue([] as never)
  const { unmount } = renderHook(() => useTeamChat('global'))
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
  const closeSpy = vi.spyOn(FakeWebSocket.instances[0], 'close')
  unmount()
  expect(closeSpy).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/use-team-chat.test.tsx`
Expected: FAIL (`useTeamChat` no está exportado).

- [ ] **Step 3: Add the hook** — en `lib/teamChat.ts`, añade arriba los imports y al final el hook:

```typescript
import { useEffect, useRef, useState } from 'react'
import * as api from './api'
```

```typescript
export function useTeamChat(scope: 'global' | 'project', projectId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('connecting')
  const sockRef = useRef<{ send: (c: string) => void; close: () => void } | null>(null)

  useEffect(() => {
    let active = true
    const token = getToken() ?? ''
    const load = scope === 'global'
      ? api.listGlobalMessages(token)
      : api.listProjectMessages(token, projectId as string)
    load.then((history) => { if (active) setMessages(history) }).catch(() => { /* onAuthError global cubre 401 */ })

    const sock = openChatSocket(scope, projectId ?? null, {
      onMessage: (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      },
      onStatus: setStatus,
    })
    sockRef.current = sock
    return () => { active = false; sock.close() }
  }, [scope, projectId])

  return {
    messages,
    status,
    send: (content: string) => sockRef.current?.send(content),
  }
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `npx vitest run tests/use-team-chat.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/teamChat.ts tests/use-team-chat.test.tsx
git commit -m "feat: useTeamChat hook (history + live socket)"
```

---

### Task 6: Frontend — vista compartida, página global, link de sidebar y panel de proyecto

**Repo:** `idled-frontend`

**Files:**
- Create: `components/TeamChatView.tsx` (lista + composer, compartido por página y panel)
- Create: `app/(app)/chat/page.tsx` (página global)
- Create: `components/kanban/TeamChatPanel.tsx` (drawer del proyecto)
- Modify: `components/Sidebar.tsx` (quitar placeholder, añadir link `/chat`)
- Modify: `app/(app)/project/[id]/page.tsx` (montar el panel)
- Test: `tests/chat-page.test.tsx`, `tests/team-chat-panel.test.tsx`, y una aserción en `tests/shell.test.tsx`

**Interfaces:**
- Consumes: `useTeamChat(scope, projectId?)` (Tarea 5).
- Produces: `TeamChatView`, página `/chat`, `TeamChatPanel`.

- [ ] **Step 1: Write the failing page + panel tests**

Crear `tests/chat-page.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as tc from '@/lib/teamChat'
import type { ChatMessage } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const one: ChatMessage = {
  id: 'm1', scope: 'global', project_id: null, author_external_id: 'x',
  author_name: 'X', content: 'hola', created_at: '', mine: false,
}

function stub(messages: ChatMessage[], status: tc.ChatStatus = 'open') {
  const send = vi.fn()
  vi.spyOn(tc, 'useTeamChat').mockReturnValue({ messages, status, send } as never)
  return { send }
}

it('renders messages and sends on click', async () => {
  const { send } = stub([one])
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByTestId('chat-message')).toHaveTextContent('hola')
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'buenas' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(send).toHaveBeenCalledWith('buenas')
})

it('disables the composer when not open', async () => {
  stub([], 'connecting')
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByLabelText('enviar')).toBeDisabled()
})

it('shows an empty state', async () => {
  stub([], 'open')
  const { default: Page } = await import('@/app/(app)/chat/page')
  render(<Page />)
  expect(screen.getByText('Sin mensajes todavía')).toBeInTheDocument()
})
```

Crear `tests/team-chat-panel.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as tc from '@/lib/teamChat'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(tc, 'useTeamChat').mockReturnValue({ messages: [], status: 'open', send: vi.fn() } as never)
})

it('opens and closes the drawer', async () => {
  const { default: Panel } = await import('@/components/kanban/TeamChatPanel')
  render(<Panel projectId="p1" />)
  expect(screen.queryByTestId('team-chat-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('abrir chat'))
  expect(screen.getByTestId('team-chat-panel')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('cerrar chat'))
  expect(screen.queryByTestId('team-chat-panel')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/chat-page.test.tsx tests/team-chat-panel.test.tsx`
Expected: FAIL (los módulos de página/panel no existen).

- [ ] **Step 3: Create the shared view** — `components/TeamChatView.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useTeamChat } from '@/lib/teamChat'

export default function TeamChatView({ scope, projectId }: { scope: 'global' | 'project'; projectId?: string }) {
  const { messages, status, send } = useTeamChat(scope, projectId)
  const [draft, setDraft] = useState('')

  function submit() {
    const c = draft.trim()
    if (!c) return
    send(c)
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <p style={{ color: '#888' }}>Sin mensajes todavía</p>
        ) : messages.map((m) => (
          <div key={m.id} data-testid="chat-message"
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: 10, borderRadius: 10,
              background: m.mine ? 'var(--accent)' : 'var(--bg-3)', color: m.mine ? '#000' : 'var(--text)',
            }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{m.author_name}</div>
            <div>{m.content}</div>
          </div>
        ))}
      </div>
      {status === 'unauthorized' && (
        <p role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>No se pudo conectar al chat.</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input aria-label="mensaje" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          disabled={status !== 'open'} placeholder="Escribe un mensaje…"
          style={{ flex: 1, padding: 10, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
        <button aria-label="enviar" onClick={submit} disabled={status !== 'open'}
          style={{ padding: '10px 16px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          Enviar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the global page** — `app/(app)/chat/page.tsx`

```tsx
'use client'
import TeamChatView from '@/components/TeamChatView'

export default function ChatPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Chat de equipo</h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TeamChatView scope="global" />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create the project drawer panel** — `components/kanban/TeamChatPanel.tsx`

```tsx
'use client'
import { useState } from 'react'
import TeamChatView from '@/components/TeamChatView'

export default function TeamChatPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button aria-label="abrir chat" onClick={() => setOpen(true)}
        style={{ padding: '6px 12px', background: 'var(--bg-4)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
        💬 Chat
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
          <aside data-testid="team-chat-panel"
            style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, zIndex: 41,
              background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', color: 'var(--text)',
              padding: 16, display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700 }}>Chat del proyecto</span>
              <button aria-label="cerrar chat" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TeamChatView scope="project" projectId={projectId} />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 6: Run the page + panel tests to verify they pass**

Run: `npx vitest run tests/chat-page.test.tsx tests/team-chat-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Wire the sidebar link** — en `components/Sidebar.tsx`:
  1. Añade a la constante `NAV` una entrada: `{ href: '/chat', label: 'Chat de equipo' }`.
  2. Quita `'Chat de equipo'` de `PLACEHOLDERS` (queda `const PLACEHOLDERS = ['Equipo']`).

- [ ] **Step 8: Mount the panel in the project page** — reemplaza `app/(app)/project/[id]/page.tsx` por:

```tsx
import Board from '@/components/kanban/Board'
import TeamPanel from '@/components/kanban/TeamPanel'
import TeamChatPanel from '@/components/kanban/TeamChatPanel'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TeamPanel projectId={params.id} />
        <TeamChatPanel projectId={params.id} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Board projectId={params.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Add the sidebar link assertion** — en `tests/shell.test.tsx`, añade al final:

```typescript
it('shows a Chat de equipo link', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useNotifications').mockReturnValue({ data: [] } as never)
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  const link = screen.getByRole('link', { name: 'Chat de equipo' })
  expect(link).toHaveAttribute('href', '/chat')
})
```

- [ ] **Step 10: Run the full frontend suite (regression guard)**

Run: `npx vitest run`
Expected: PASS (toda la suite, incluidos los nuevos y `shell.test.tsx`).

- [ ] **Step 11: Build check**

Run: `npm run build`
Expected: compila; la ruta `/chat` aparece en el output.

- [ ] **Step 12: Commit**

```bash
git add components/TeamChatView.tsx "app/(app)/chat/page.tsx" components/kanban/TeamChatPanel.tsx \
        components/Sidebar.tsx "app/(app)/project/[id]/page.tsx" \
        tests/chat-page.test.tsx tests/team-chat-panel.test.tsx tests/shell.test.tsx
git commit -m "feat: team chat page, sidebar link, and project chat drawer"
```

---

## Notas de cierre

- Tras la Tarea 6: revisión final de rama completa (cross-repo), luego `finishing-a-development-branch` + push de ambos repos.
- **Fuera de alcance (recordatorio):** editar/borrar, no-leídos/last-read, typing/presencia, reacciones, adjuntos, menciones, hilos, paginación infinita, Redis pub/sub multi-instancia, integración con Notificaciones, rate limiting, endurecimiento del token WS para prod (subprotocolo/cookie).
- **Backlog fast-follow heredado:** `--text-muted` para grises `#888`, formato de fechas, `enabled` de members/users, flash de estados vacíos.
