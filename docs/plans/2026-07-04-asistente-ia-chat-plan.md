# Asistente IA (chat con historial) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An AI-assistant page with a conversation-history list and a chat pane that streams the assistant's reply, reusing the existing `POST /api/chat` SSE endpoint.

**Architecture:** The backend gains a `title` on `AiConversation` (set from the first message) and two owner-scoped list endpoints (`GET /api/conversations`, `GET /api/conversations/{id}/messages`). The frontend adds a dedicated SSE-consuming helper (`streamChat`), conversation/message types + api + query hooks, and an `/assistant` page: a left pane listing conversations and a right pane that shows persisted messages plus the in-flight exchange (user message + assistant tokens accumulating live).

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Tasks 1–2 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 3–5 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **Ownership:** conversations and messages are only the authenticated user's. `list_messages` on a conversation not owned by the user → None → 404 (never 403).
- **`title`** is set once, when a conversation is created, from `first_message[:80]`. Existing conversations are never retitled.
- **The existing `POST /api/chat` SSE contract is unchanged** (events `meta`/`token`/`done`); the only edit is passing `first_message=body.message` into `get_or_create_conversation`.
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>`. Tables build via `Base.metadata.create_all` (conftest imports `app.agente.models`) — the migration is for the real DB.
- **Frontend tests run on the HOST:** `npx vitest run <path>`. vitest scoped to `tests/**/*.test.{ts,tsx}`.
- **`streamChat` is separate from `apiFetch`** (which does `res.json()`); it reads `res.body` as a stream and parses SSE frames.
- Dark tokens (sibling components use `#888`; acceptable). TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).

---

## File Structure

**Backend (`idled-backend`):**
- `app/agente/models.py` — `AiConversation.title`.
- `migrations/versions/b8c0d2e4f6a1_conversation_title.py` — NEW (down_revision `a7b9c1d3e5f7`).
- `app/agente/service.py` — `get_or_create_conversation(first_message=…)`, `list_conversations`, `list_messages`.
- `app/api/chat.py` — pass `first_message`; `GET /api/conversations`, `GET /api/conversations/{id}/messages`.
- Tests: `tests/test_chat_persistence.py`, `tests/test_chat_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/api.ts` — export `apiBase`; `listConversations`, `listMessages`.
- `lib/chat.ts` — NEW `streamChat`.
- `lib/types.ts` — `Conversation`, `ChatMessage`.
- `lib/queries.ts` — `useConversations`, `useMessages`.
- `app/(app)/assistant/page.tsx` — NEW page.
- `components/Sidebar.tsx` — add the "Asistente IA" nav item.
- Tests: `tests/chat-stream.test.ts` (new), `tests/conversation-queries.test.tsx` (new), `tests/assistant-page.test.tsx` (new).

---

### Task 1: Backend conversation `title` + list services

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/agente/models.py`, `app/agente/service.py`
- Create: `migrations/versions/b8c0d2e4f6a1_conversation_title.py`
- Test: `tests/test_chat_persistence.py`

**Interfaces:**
- Consumes: existing `get_or_create_conversation`, `append_message`, the conftest `session` fixture.
- Produces:
  - `AiConversation.title: str | None`.
  - `get_or_create_conversation(session, user_external_id, conversation_id, first_message=None)` — sets `title = first_message[:80]` when creating.
  - `list_conversations(session, user_external_id) -> list[AiConversation]` (newest first).
  - `list_messages(session, conversation_id, user_external_id) -> list[AiMessage] | None` (None if not owned; roles user/assistant, ordered by created_at).

- [ ] **Step 1: Write the failing service tests** — append to `tests/test_chat_persistence.py`

```python
import pytest
from app.agente.service import (
    get_or_create_conversation, append_message, list_conversations, list_messages,
)

@pytest.mark.asyncio
async def test_title_set_from_first_message_on_create(session):
    conv = await get_or_create_conversation(session, "ext-1", None, first_message="Hola mundo")
    assert conv.title == "Hola mundo"
    # reopening the same conversation does not retitle it
    again = await get_or_create_conversation(session, "ext-1", conv.id, first_message="otra cosa")
    assert again.id == conv.id and again.title == "Hola mundo"

@pytest.mark.asyncio
async def test_list_conversations_only_own_newest_first(session):
    a = await get_or_create_conversation(session, "ext-1", None, first_message="A")
    b = await get_or_create_conversation(session, "ext-1", None, first_message="B")
    await get_or_create_conversation(session, "ext-2", None, first_message="otra")
    mine = await list_conversations(session, "ext-1")
    assert [c.id for c in mine] == [b.id, a.id]   # newest first

@pytest.mark.asyncio
async def test_list_messages_owner_and_ordering(session):
    conv = await get_or_create_conversation(session, "ext-1", None, first_message="hi")
    await append_message(session, conv.id, "user", "uno")
    await append_message(session, conv.id, "assistant", "dos")
    msgs = await list_messages(session, conv.id, "ext-1")
    assert [(m.role, m.content) for m in msgs] == [("user", "uno"), ("assistant", "dos")]
    assert await list_messages(session, conv.id, "ext-2") is None    # not owner
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_chat_persistence.py -k "title or list_conversations or list_messages" -v`
Expected: FAIL — `first_message` kwarg / `list_conversations` / `list_messages` / `title` do not exist.

- [ ] **Step 3: Add the `title` column** — `app/agente/models.py`

Add to `AiConversation` (after `user_external_id`; `String` is already imported):

```python
    title: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 4: Extend the service** — `app/agente/service.py`

Change `get_or_create_conversation` to accept `first_message` and set the title on creation:

```python
async def get_or_create_conversation(
    session: AsyncSession, user_external_id: str, conversation_id: uuid.UUID | None,
    first_message: str | None = None,
) -> AiConversation:
    if conversation_id is not None:
        result = await session.execute(
            select(AiConversation).where(
                AiConversation.id == conversation_id,
                AiConversation.user_external_id == user_external_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            return existing
    conv = AiConversation(
        user_external_id=user_external_id,
        title=first_message[:80] if first_message else None,
    )
    session.add(conv)
    await session.commit()
    await session.refresh(conv)
    return conv
```

Append the two list services (after `load_history`):

```python
async def list_conversations(
    session: AsyncSession, user_external_id: str
) -> list[AiConversation]:
    result = await session.execute(
        select(AiConversation).where(AiConversation.user_external_id == user_external_id)
        .order_by(AiConversation.created_at.desc())
    )
    return list(result.scalars().all())


async def list_messages(
    session: AsyncSession, conversation_id: uuid.UUID, user_external_id: str
) -> list[AiMessage] | None:
    result = await session.execute(
        select(AiConversation).where(
            AiConversation.id == conversation_id,
            AiConversation.user_external_id == user_external_id,
        )
    )
    if result.scalar_one_or_none() is None:
        return None
    result = await session.execute(
        select(AiMessage).where(AiMessage.conversation_id == conversation_id)
        .order_by(AiMessage.created_at)
    )
    return [m for m in result.scalars().all() if m.role in ("user", "assistant")]
```

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_chat_persistence.py -v`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Create the Alembic migration** — `migrations/versions/b8c0d2e4f6a1_conversation_title.py`

```python
"""conversation title

Revision ID: b8c0d2e4f6a1
Revises: a7b9c1d3e5f7
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c0d2e4f6a1'
down_revision: Union[str, Sequence[str], None] = 'a7b9c1d3e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('ai_conversations', sa.Column('title', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ai_conversations', 'title')
```

Verify it applies (or is the new head):

Run: `docker compose run --rm api alembic upgrade head`
Expected: applies `a7b9c1d3e5f7 -> b8c0d2e4f6a1`. If no DB is reachable, run `docker compose run --rm api alembic history` and confirm `b8c0d2e4f6a1` is the head after `a7b9c1d3e5f7`; note which you verified.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/agente/models.py app/agente/service.py migrations/versions/b8c0d2e4f6a1_conversation_title.py tests/test_chat_persistence.py
git commit -m "feat: conversation title and list_conversations/list_messages services"
```

---

### Task 2: Backend conversation list endpoints

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/api/chat.py`
- Test: `tests/test_chat_endpoint.py`

**Interfaces:**
- Consumes: `list_conversations`, `list_messages` from `app.agente.service`; `get_current_user`.
- Produces:
  - `POST /api/chat` now sets the title (passes `first_message=body.message`).
  - `GET /api/conversations` → `[{id, title, created_at}]`.
  - `GET /api/conversations/{id}/messages` → `[{role, content, created_at}]` (404 if not owned).

- [ ] **Step 1: Write the failing endpoint test** — append to `tests/test_chat_endpoint.py`

(Reuse this file's existing `app_with_overrides` fixture and `_token`. It already imports `json` and `httpx`.)

```python
def _conv_id_from_stream(text: str):
    for line in text.splitlines():
        if line.startswith("data:"):
            payload = json.loads(line[5:].strip())
            if payload.get("type") == "meta":
                return payload["conversation_id"]
    return None

@pytest.mark.asyncio
async def test_list_conversations_and_messages(app_with_overrides, session):
    import uuid as _uuid
    transport = httpx.ASGITransport(app=app_with_overrides)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        r = await ac.post("/api/chat", json={"message": "¿facturas?", "conversation_id": None}, headers=h)
        cid = _conv_id_from_stream(r.text)
        assert cid is not None

        lc = await ac.get("/api/conversations", headers=h)
        assert lc.status_code == 200
        by_id = {c["id"]: c for c in lc.json()}
        assert cid in by_id and by_id[cid]["title"] == "¿facturas?"

        lm = await ac.get(f"/api/conversations/{cid}/messages", headers=h)
        assert lm.status_code == 200
        assert [m["role"] for m in lm.json()] == ["user", "assistant"]

        r404 = await ac.get(f"/api/conversations/{_uuid.uuid4()}/messages", headers=h)
        assert r404.status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_chat_endpoint.py -k list_conversations_and_messages -v`
Expected: FAIL — routes not found (404 for `/api/conversations`) / title is null.

- [ ] **Step 3: Pass `first_message` and add the endpoints** — `app/api/chat.py`

Add `HTTPException` to the fastapi import and `list_conversations, list_messages` to the service import:

```python
from fastapi import APIRouter, Depends, Header, HTTPException
from app.agente.service import append_message, get_or_create_conversation, load_history, list_conversations, list_messages
```

In the `chat(...)` handler, pass the first message so a new conversation gets a title:

```python
    conv = await get_or_create_conversation(session, user.external_id, body.conversation_id, first_message=body.message)
```

Add the two GET endpoints (after the `chat` handler):

```python
@router.get("/conversations")
async def listar_conversaciones(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    convs = await list_conversations(session, user.external_id)
    return [
        {"id": str(c.id), "title": c.title,
         "created_at": c.created_at.isoformat() if c.created_at else None}
        for c in convs
    ]


@router.get("/conversations/{conversation_id}/messages")
async def listar_mensajes(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    msgs = await list_messages(session, conversation_id, user.external_id)
    if msgs is None:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    return [
        {"role": m.role, "content": m.content,
         "created_at": m.created_at.isoformat() if m.created_at else None}
        for m in msgs
    ]
```

- [ ] **Step 4: Run the endpoint test, then the full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_chat_endpoint.py -v
docker compose run --rm api pytest -q
```
Expected: the new test passes; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/api/chat.py tests/test_chat_endpoint.py
git commit -m "feat: conversation list endpoints and title on new chats"
```

---

### Task 3: Frontend SSE streaming helper (`streamChat`)

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/api.ts` (export `apiBase`)
- Create: `lib/chat.ts`, `tests/chat-stream.test.ts`

**Interfaces:**
- Produces:
  - `apiBase()` becomes an exported function in `lib/api.ts`.
  - `streamChat(token, input: { message: string; conversationId?: string }, handlers: { onMeta?(m: ChatMeta): void; onToken?(text: string): void; onDone?(): void }): Promise<void>` where `ChatMeta = { conversation_id: string; model: string; tools_used: string[] }`.

- [ ] **Step 1: Write the failing test** — `tests/chat-stream.test.ts`

```ts
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamChat } from '@/lib/chat'

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

it('parses meta/token/done and handles a frame split across chunks', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([
    'data: {"type":"meta","conversation_id":"c1","model":"gpt-4o","tools_used":[]}\n\n',
    'data: {"type":"token","text":"Hola "}\n\ndata: {"type":"to',
    'ken","text":"mundo"}\n\n',
    'data: {"type":"done"}\n\n',
  ]))
  const metas: any[] = []
  const tokens: string[] = []
  let dones = 0
  await streamChat('tok', { message: 'hi' }, {
    onMeta: (m) => metas.push(m),
    onToken: (t) => tokens.push(t),
    onDone: () => { dones += 1 },
  })
  expect(metas[0].conversation_id).toBe('c1')
  expect(tokens).toEqual(['Hola ', 'mundo'])
  expect(dones).toBe(1)
})

it('throws on a non-ok response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
  await expect(streamChat('tok', { message: 'hi' }, {})).rejects.toThrow()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/chat-stream.test.ts`
Expected: FAIL — cannot resolve `@/lib/chat`.

- [ ] **Step 3: Export `apiBase`** — `lib/api.ts`

Change the private function to an export:

```ts
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
}
```

- [ ] **Step 4: Create `lib/chat.ts`**

```ts
import { apiBase } from '@/lib/api'

export interface ChatMeta {
  conversation_id: string
  model: string
  tools_used: string[]
}

export async function streamChat(
  token: string,
  input: { message: string; conversationId?: string },
  handlers: { onMeta?: (m: ChatMeta) => void; onToken?: (text: string) => void; onDone?: () => void },
): Promise<void> {
  const res = await fetch(`${apiBase()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: input.message, conversation_id: input.conversationId ?? null }),
  })
  if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = JSON.parse(line.slice(5).trim())
      if (payload.type === 'meta') handlers.onMeta?.(payload)
      else if (payload.type === 'token') handlers.onToken?.(payload.text)
      else if (payload.type === 'done') handlers.onDone?.()
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/chat-stream.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/api.ts lib/chat.ts tests/chat-stream.test.ts
git commit -m "feat: streamChat SSE helper for the assistant chat"
```

---

### Task 4: Frontend conversation types, api, and hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`
- Test: `tests/conversation-queries.test.tsx` (create)

**Interfaces:**
- Produces:
  - `Conversation { id: string; title: string | null; created_at: string }`, `ChatMessage { role: 'user' | 'assistant'; content: string; created_at: string }`.
  - `listConversations(token)`, `listMessages(token, conversationId)`.
  - `useConversations()` → `['conversations']`; `useMessages(conversationId)` → `['messages', conversationId]`.

- [ ] **Step 1: Write the failing test** — `tests/conversation-queries.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useConversations, useMessages } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useConversations loads via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listConversations').mockResolvedValue([] as never)
  const { result } = renderHook(() => useConversations(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useMessages loads a conversation via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listMessages').mockResolvedValue([] as never)
  const { result } = renderHook(() => useMessages('conv1'), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok', 'conv1')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/conversation-queries.test.tsx`
Expected: FAIL — hooks / api functions not exported.

- [ ] **Step 3: Add the types** — `lib/types.ts`

```ts
export interface Conversation {
  id: string
  title: string | null
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
```

- [ ] **Step 4: Add the api functions** — `lib/api.ts`

Extend the type import and append the functions:

```ts
import type { Project, Task, TaskStatus, TaskComment, Conversation, ChatMessage } from '@/lib/types'
```
```ts
export const listConversations = (token: string) =>
  apiFetch<Conversation[]>('/api/conversations', { token })

export const listMessages = (token: string, conversationId: string) =>
  apiFetch<ChatMessage[]>(`/api/conversations/${conversationId}/messages`, { token })
```

- [ ] **Step 5: Add the hooks** — `lib/queries.ts`

Append:

```ts
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.listConversations(token()),
    enabled: Boolean(getToken()),
  })
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.listMessages(token(), conversationId),
    enabled: Boolean(conversationId) && Boolean(getToken()),
  })
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/conversation-queries.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/types.ts lib/api.ts lib/queries.ts tests/conversation-queries.test.tsx
git commit -m "feat: conversation types, api, and query hooks"
```

---

### Task 5: Assistant page + sidebar nav

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `app/(app)/assistant/page.tsx`, `tests/assistant-page.test.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `useConversations`, `useMessages`; `streamChat`; `getToken`; `useQueryClient`.
- Produces: the `/assistant` route and an "Asistente IA" sidebar link.

- [ ] **Step 1: Write the failing test** — `tests/assistant-page.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import * as chat from '@/lib/chat'
import * as auth from '@/lib/auth'
import type { Conversation } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const convs: Conversation[] = [
  { id: 'c1', title: '¿facturas?', created_at: '2026-07-04T10:00:00+00:00' },
]

function stub(streamImpl?: typeof chat.streamChat) {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(queries, 'useConversations').mockReturnValue({ data: convs } as never)
  vi.spyOn(queries, 'useMessages').mockReturnValue({ data: [] } as never)
  const stream = vi.spyOn(chat, 'streamChat')
  if (streamImpl) stream.mockImplementation(streamImpl as never)
  else stream.mockResolvedValue(undefined)
  return { stream }
}

it('lists conversations', async () => {
  stub()
  const { default: Page } = await import('@/app/(app)/assistant/page')
  render(<Page />)
  expect(screen.getByText('¿facturas?')).toBeInTheDocument()
})

it('sends a message and streams the assistant tokens', async () => {
  // stream mock that emits meta + two tokens and never resolves, so `pending` stays visible
  stub(((_t, _i, h) => {
    h.onMeta?.({ conversation_id: 'c9', model: 'gpt-4o', tools_used: [] })
    h.onToken?.('Hola ')
    h.onToken?.('mundo')
    return new Promise<void>(() => {})
  }) as never)
  const { default: Page } = await import('@/app/(app)/assistant/page')
  render(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(screen.getByTestId('msg-user').textContent).toContain('hola')
  expect(await screen.findByTestId('msg-assistant')).toHaveTextContent('Hola mundo')
})

it('sends with the typed message and no conversationId when starting fresh', async () => {
  const { stream } = stub()
  const { default: Page } = await import('@/app/(app)/assistant/page')
  render(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  expect(stream).toHaveBeenCalledWith('tok', { message: 'hola', conversationId: undefined }, expect.anything())
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/assistant-page.test.tsx`
Expected: FAIL — cannot resolve `@/app/(app)/assistant/page`.

- [ ] **Step 3: Create `app/(app)/assistant/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConversations, useMessages } from '@/lib/queries'
import { streamChat } from '@/lib/chat'
import { getToken } from '@/lib/auth'

function Bubble({ role, text }: { role: string; text: string }) {
  const mine = role === 'user'
  return (
    <div data-testid={`msg-${role}`}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: '8px 12px',
        marginBottom: 8, borderRadius: 10, whiteSpace: 'pre-wrap',
        background: mine ? 'var(--accent)' : 'var(--bg-3)', color: mine ? '#000' : 'var(--text)',
      }}>
      {text}
    </div>
  )
}

export default function AssistantPage() {
  const qc = useQueryClient()
  const { data: conversations } = useConversations()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: messages } = useMessages(selectedId ?? '')
  const [pending, setPending] = useState<{ user: string; assistant: string } | null>(null)
  const [input, setInput] = useState('')

  async function send() {
    const message = input.trim()
    if (!message || pending) return
    setInput('')
    setPending({ user: message, assistant: '' })
    let convId = selectedId
    try {
      await streamChat(getToken() ?? '', { message, conversationId: selectedId ?? undefined }, {
        onMeta: (m) => { convId = m.conversation_id },
        onToken: (t) => setPending((p) => (p ? { ...p, assistant: p.assistant + t } : p)),
      })
    } catch {
      setPending((p) => (p ? { ...p, assistant: '⚠️ Error al responder' } : p))
      return
    }
    if (convId) {
      setSelectedId(convId)
      qc.invalidateQueries({ queryKey: ['conversations'] })
      qc.invalidateQueries({ queryKey: ['messages', convId] })
    }
    setPending(null)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 260, flex: '0 0 260px', borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto' }}>
        <button aria-label="nueva conversación" onClick={() => { setSelectedId(null); setPending(null) }}
          style={{ width: '100%', padding: 8, marginBottom: 10, background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          + Nueva
        </button>
        {(conversations ?? []).map((c) => (
          <button key={c.id} data-testid="conversation-item"
            onClick={() => { setSelectedId(c.id); setPending(null) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: 8, marginBottom: 4,
              background: c.id === selectedId ? 'var(--bg-3)' : 'none', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13,
            }}>
            {c.title ?? '(sin título)'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {(messages ?? []).map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}
          {pending && (
            <>
              <Bubble role="user" text={pending.user} />
              <Bubble role="assistant" text={pending.assistant} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input aria-label="mensaje" value={input} disabled={!!pending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder="Pregunta al asistente…"
            style={{ flex: 1, padding: 10, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
          <button aria-label="enviar" onClick={send} disabled={!!pending}
            style={{ padding: '10px 16px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the page test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/assistant-page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the sidebar nav item** — `components/Sidebar.tsx`

Change the `NAV` constant to include the assistant:

```tsx
const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Asistente IA' },
]
```

- [ ] **Step 6: Run the shell test, the full suite, and the build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/shell.test.tsx
npx vitest run
npm run build
```
Expected: the shell test still passes (it only asserts "Dashboard" renders); full suite passes; build compiles with the `/assistant` route emitted.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add "app/(app)/assistant/page.tsx" tests/assistant-page.test.tsx components/Sidebar.tsx
git commit -m "feat: assistant chat page with conversation history and streaming"
```

---

## Out of scope (this plan)

- Borrar / renombrar conversaciones; búsqueda en el historial.
- Streaming real token-a-token del LLM (el backend chunkea la respuesta completa; se ve typing).
- Adjuntar documentos desde el chat; markdown/rich text; mostrar qué tools se usaron.
- "Chat de equipo" (mensajería humana) — sigue como placeholder.
- Extender el smoke Playwright para el asistente.
- Backlog fast-follow heredado (401/logout, `--text-muted`, click parásito tras drag, `due_date=""`→null, `useCallback` en Esc, cierre optimista de comentarios, formato de fechas) — no aquí.

## Self-Review

**Spec coverage:**
- `title` + migración + `first_message` → Task 1 (+ Task 2 pasa el arg). ✅
- `list_conversations`/`list_messages` (owner-scoped) → Task 1; endpoints `GET /api/conversations` + `.../messages` (404 ajena) → Task 2. ✅
- `streamChat` (parseo SSE, frames partidos, throw en no-ok) → Task 3. ✅
- Tipos + api (2) + hooks (2) → Task 4. ✅
- Página `/assistant` (dos paneles, streaming/typing, Nueva) + nav "Asistente IA" → Task 5. ✅
- Propiedad por usuario (404) → Tasks 1–2 tests. ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (modelo, migración `b8c0d2e4f6a1`←`a7b9c1d3e5f7`, servicios, endpoints, helper streamChat, tipos, api, hooks, página, nav). ✅

**Type consistency:** `streamChat(token, {message, conversationId?}, {onMeta,onToken,onDone})` y `ChatMeta {conversation_id, model, tools_used}` coinciden entre Task 3 (def), su test, y el uso en la página (Task 5). `Conversation {id,title,created_at}` / `ChatMessage {role,content,created_at}` (Task 4) usados por api/hooks/página/tests. `listConversations(token)`/`listMessages(token,id)` coinciden api↔hooks↔tests. `useMessages(conversationId)` con `['messages', id]`; `useConversations` con `['conversations']` — mismas claves que invalida la página en `onDone`. `apiBase` exportado (Task 3) e importado por `lib/chat.ts`. data-testids `conversation-item`/`msg-user`/`msg-assistant` y aria-labels `mensaje`/`enviar`/`nueva conversación` consistentes entre página (Task 5) y su test. NAV con `/assistant` (Task 5) → la página existe (Task 5). ✅
