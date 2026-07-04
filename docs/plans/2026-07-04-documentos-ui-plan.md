# Documentos en la UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Documentos page to upload PDF/Excel files and see the document list with live processing status, reusing the existing backend pipeline endpoints.

**Architecture:** The only backend change is including the `error` field in `GET /api/documentos` so the UI can show why a document `failed`. The frontend adds a multipart `uploadDocument` helper (separate from the JSON `apiFetch`), a `listDocuments` api + `DocumentItem` type, `useDocuments` (polling while any document is still processing) + `useUploadDocument` hooks, and a `/documentos` page with an upload control and a status-badged list.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Task 1 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 2–3 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **No new DB column / no migration** — `Document.error` already exists; Task 1 only adds it to the list serialization.
- **Upload is multipart** (`FormData`), and the helper must NOT set a `Content-Type` header (the browser sets the multipart boundary). It is separate from `apiFetch`.
- **Status lifecycle:** `uploaded` → `processing` → `indexed` | `failed` (with `error`). `useDocuments` polls (`refetchInterval` 3000ms) while any document is `uploaded`/`processing`, else stops.
- **RBAC is enforced server-side** (`documentos:write` to upload). The frontend attempts the upload and surfaces a `role="alert"` notice on failure (e.g. 403); it does not decode the JWT.
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>`. **Frontend tests run on the HOST:** `npx vitest run <path>` (vitest scoped to `tests/**/*.test.{ts,tsx}`).
- Dark tokens: `var(--green)` and `var(--red)` exist in globals.css; muted text uses `#888` (sibling-accepted). TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).

---

## File Structure

**Backend (`idled-backend`):**
- `app/api/documentos.py` — add `"error"` to the GET list dict.
- Test: `tests/test_documentos_endpoint.py`.

**Frontend (`idled-frontend`):**
- `lib/documents.ts` — NEW `uploadDocument`.
- `lib/api.ts` — `listDocuments`.
- `lib/types.ts` — `DocumentItem`.
- `lib/queries.ts` — `useDocuments`, `useUploadDocument`.
- `app/(app)/documentos/page.tsx` — NEW page.
- `components/Sidebar.tsx` — add the "Documentos" nav item.
- Tests: `tests/document-upload.test.ts` (new), `tests/document-queries.test.tsx` (new), `tests/documentos-page.test.tsx` (new).

---

### Task 1: Backend — expose `error` in the document list

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/api/documentos.py`
- Test: `tests/test_documentos_endpoint.py`

**Interfaces:**
- Consumes: existing `app_with_overrides` fixture + `_token` in the test file; `set_status` from `app.documentos.service`.
- Produces: `GET /api/documentos` items include `"error"` (null unless the document is `failed`).

- [ ] **Step 1: Write the failing test** — append to `tests/test_documentos_endpoint.py`

```python
@pytest.mark.asyncio
async def test_list_includes_error_field(app_with_overrides, session):
    import uuid as _uuid
    from app.documentos.service import set_status
    transport = httpx.ASGITransport(app=app_with_overrides)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        h = {"Authorization": f"Bearer {_token()}"}
        did = (await ac.post("/api/documentos", headers=h,
                             files={"file": ("a.txt", b"x", "text/plain")})).json()["document_id"]
        docs = (await ac.get("/api/documentos", headers=h)).json()
        assert docs[0]["error"] is None                     # fresh upload: no error
        await set_status(session, _uuid.UUID(did), "failed", error="boom")
        docs2 = (await ac.get("/api/documentos", headers=h)).json()
        assert docs2[0]["status"] == "failed" and docs2[0]["error"] == "boom"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_documentos_endpoint.py::test_list_includes_error_field -v`
Expected: FAIL — `KeyError: 'error'` (the field isn't serialized).

> If `set_status` does not commit internally, the GET (same overridden session) still sees the change because the fixture yields the SAME `session` object; if the assertion on `docs2` fails for visibility reasons, add `await session.commit()` after `set_status` in the test. Try without it first.

- [ ] **Step 3: Add `error` to the list serialization** — `app/api/documentos.py`

In the `listar` handler, add the `error` key:

```python
    return [
        {"id": str(d.id), "filename": d.filename, "status": d.status,
         "error": d.error,
         "created_at": d.created_at.isoformat() if d.created_at else None}
        for d in docs
    ]
```

- [ ] **Step 4: Run the test to verify it passes, then the full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_documentos_endpoint.py -v
docker compose run --rm api pytest -q
```
Expected: the new test passes; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/api/documentos.py tests/test_documentos_endpoint.py
git commit -m "feat: include error field in the document list response"
```

---

### Task 2: Frontend — upload helper, list api, types, and hooks

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `lib/documents.ts`, `tests/document-upload.test.ts`, `tests/document-queries.test.tsx`
- Modify: `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`

**Interfaces:**
- Produces:
  - `uploadDocument(token, file): Promise<{ document_id: string; status: string }>` (multipart, no Content-Type header, throws on non-ok).
  - `DocumentItem { id; filename; status; created_at; error: string | null }`.
  - `listDocuments(token)`.
  - `useDocuments()` → `['documents']`, polls while any doc is `uploaded`/`processing`.
  - `useUploadDocument()` → `mutate(file)`, invalidates `['documents']`.

- [ ] **Step 1: Write the failing tests** — `tests/document-upload.test.ts`

```ts
import { it, expect, vi, beforeEach } from 'vitest'
import { uploadDocument } from '@/lib/documents'

beforeEach(() => vi.restoreAllMocks())

it('POSTs the file as multipart with the bearer token and no JSON content-type', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ document_id: 'd1', status: 'uploaded' }), { status: 200 }),
  )
  const file = new File(['hola'], 'a.pdf', { type: 'application/pdf' })
  const out = await uploadDocument('tok', file)
  expect(out).toEqual({ document_id: 'd1', status: 'uploaded' })
  const [url, init] = spy.mock.calls[0]
  expect(String(url)).toContain('/api/documentos')
  expect(init?.method).toBe('POST')
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  expect(init?.body).toBeInstanceOf(FormData)
  expect((init?.body as FormData).get('file')).toBe(file)
})

it('throws on a non-ok response', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }))
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  await expect(uploadDocument('tok', file)).rejects.toThrow()
})
```

And `tests/document-queries.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as documents from '@/lib/documents'
import * as auth from '@/lib/auth'
import { useDocuments, useUploadDocument } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useDocuments loads via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(api, 'listDocuments').mockResolvedValue([] as never)
  const { result } = renderHook(() => useDocuments(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(spy).toHaveBeenCalledWith('tok')
})

it('useUploadDocument uploads via the helper with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const spy = vi.spyOn(documents, 'uploadDocument').mockResolvedValue({ document_id: 'd1', status: 'uploaded' })
  const { result } = renderHook(() => useUploadDocument(), { wrapper: wrapper() })
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  result.current.mutate(file)
  await waitFor(() => expect(spy).toHaveBeenCalledWith('tok', file))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/document-upload.test.ts tests/document-queries.test.tsx`
Expected: FAIL — `@/lib/documents` / hooks / `listDocuments` not found.

- [ ] **Step 3: Create `lib/documents.ts`**

```ts
import { apiBase } from '@/lib/api'

export async function uploadDocument(
  token: string,
  file: File,
): Promise<{ document_id: string; status: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${apiBase()}/api/documentos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Upload ${res.status}`)
  return (await res.json()) as { document_id: string; status: string }
}
```

- [ ] **Step 4: Add the `DocumentItem` type** — `lib/types.ts`

```ts
export interface DocumentItem {
  id: string
  filename: string
  status: string
  created_at: string
  error: string | null
}
```

- [ ] **Step 5: Add `listDocuments`** — `lib/api.ts`

Extend the type import and append the function:

```ts
import type { Project, Task, TaskStatus, TaskComment, Conversation, ChatMessage, DocumentItem } from '@/lib/types'
```
```ts
export const listDocuments = (token: string) =>
  apiFetch<DocumentItem[]>('/api/documentos', { token })
```

- [ ] **Step 6: Add the hooks** — `lib/queries.ts`

Add the import for the upload helper at the top (next to the existing imports):

```ts
import { uploadDocument } from '@/lib/documents'
```

Append the hooks:

```ts
export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.listDocuments(token()),
    enabled: Boolean(getToken()),
    refetchInterval: (query) => {
      const docs = query.state.data
      const pending = (docs ?? []).some((d) => d.status === 'uploaded' || d.status === 'processing')
      return pending ? 3000 : false
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadDocument(token(), file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/document-upload.test.ts tests/document-queries.test.tsx`
Expected: PASS (2 + 2).

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/documents.ts lib/api.ts lib/types.ts lib/queries.ts tests/document-upload.test.ts tests/document-queries.test.tsx
git commit -m "feat: document upload helper, list api, and query hooks"
```

---

### Task 3: Frontend — Documentos page + sidebar nav

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Create: `app/(app)/documentos/page.tsx`, `tests/documentos-page.test.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `useDocuments`, `useUploadDocument`.
- Produces: the `/documentos` route and a "Documentos" sidebar link.

- [ ] **Step 1: Write the failing test** — `tests/documentos-page.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { DocumentItem } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const docs: DocumentItem[] = [
  { id: 'd1', filename: 'informe.pdf', status: 'indexed', created_at: '2026-07-04T10:00:00+00:00', error: null },
  { id: 'd2', filename: 'roto.xlsx', status: 'failed', created_at: '2026-07-04T11:00:00+00:00', error: 'no se pudo leer' },
]

function stub(list: DocumentItem[]) {
  const mutate = vi.fn()
  vi.spyOn(queries, 'useDocuments').mockReturnValue({ data: list } as never)
  vi.spyOn(queries, 'useUploadDocument').mockReturnValue({ mutate, isPending: false } as never)
  return { mutate }
}

it('lists documents with status and shows the error on a failed one', async () => {
  stub(docs)
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  expect(screen.getByText('informe.pdf')).toBeInTheDocument()
  expect(screen.getByText('indexed')).toBeInTheDocument()
  expect(screen.getByText('no se pudo leer')).toBeInTheDocument()
  expect(screen.getAllByTestId('document-item')).toHaveLength(2)
})

it('shows an empty state with no documents', async () => {
  stub([])
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  expect(screen.getByText('Sin documentos')).toBeInTheDocument()
})

it('uploads the chosen file', async () => {
  const { mutate } = stub([])
  const { default: Page } = await import('@/app/(app)/documentos/page')
  render(<Page />)
  const file = new File(['x'], 'nuevo.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText('archivo'), { target: { files: [file] } })
  fireEvent.click(screen.getByLabelText('subir'))
  expect(mutate).toHaveBeenCalledWith(file, expect.anything())
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/documentos-page.test.tsx`
Expected: FAIL — cannot resolve `@/app/(app)/documentos/page`.

- [ ] **Step 3: Create `app/(app)/documentos/page.tsx`**

```tsx
'use client'
import { useRef, useState } from 'react'
import { useDocuments, useUploadDocument } from '@/lib/queries'

const badgeColor: Record<string, string> = {
  uploaded: '#888',
  processing: '#888',
  indexed: 'var(--green)',
  failed: 'var(--red)',
}

export default function DocumentosPage() {
  const { data: documents } = useDocuments()
  const upload = useUploadDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function onUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) return
    setError(null)
    upload.mutate(file, {
      onError: () => setError('No se pudo subir el documento (¿permiso o red?).'),
      onSuccess: () => { if (inputRef.current) inputRef.current.value = '' },
    })
  }

  const list = documents ?? []

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Documentos</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input ref={inputRef} type="file" aria-label="archivo" accept=".pdf,.xlsx,.xls"
          style={{ color: 'var(--text)', fontSize: 13 }} />
        <button aria-label="subir" onClick={onUpload} disabled={upload.isPending}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          Subir
        </button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {list.length === 0 ? (
        <p style={{ color: '#888' }}>Sin documentos</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((d) => (
            <div key={d.id} data-testid="document-item"
              style={{ padding: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{d.filename}</span>
                <span className="mono" style={{ fontSize: 11, color: badgeColor[d.status] ?? '#888' }}>{d.status}</span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{d.created_at}</div>
              {d.status === 'failed' && d.error && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{d.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the page test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/documentos-page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the sidebar nav item** — `components/Sidebar.tsx`

Extend the `NAV` array:

```tsx
const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Asistente IA' },
  { href: '/documentos', label: 'Documentos' },
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
Expected: shell test still passes; full suite passes; build compiles with the `/documentos` route emitted.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add "app/(app)/documentos/page.tsx" tests/documentos-page.test.tsx components/Sidebar.tsx
git commit -m "feat: documents page with upload and status list"
```

---

## Out of scope (this plan)

- Borrar / renombrar documentos (no hay endpoint de borrado); previsualizar contenido.
- Buscador propio (la búsqueda va en el chat del Asistente).
- Progreso de subida por bytes, drag-and-drop, filtros/orden, paginación.
- Extender el smoke Playwright para documentos.
- Backlog fast-follow heredado (401/logout, `--text-muted`, click parásito tras drag, `due_date=""`→null, `useCallback` en Esc, cierre optimista de comentarios, parpadeo del chat, formato de fechas) — no aquí.

## Self-Review

**Spec coverage:**
- `error` en `GET /api/documentos` → Task 1. ✅
- `uploadDocument` multipart (sin Content-Type, throw en no-ok) → Task 2. ✅
- `DocumentItem` + `listDocuments` + `useDocuments` (poll mientras uploaded/processing) + `useUploadDocument` (invalida `['documents']`) → Task 2. ✅
- Página `/documentos` (subir, lista con badges por estado, error en failed, vacío, aviso 403) + nav "Documentos" → Task 3. ✅
- RBAC server-side + 403 manejado en la UI → Task 3 (onError). ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (serialización backend, helper de subida, tipos, api, hooks con refetchInterval, página, nav). ✅

**Type consistency:** `uploadDocument(token, file)` coincide entre Task 2 (def), su test, y `useUploadDocument` (Task 2) y el uso en la página (Task 3, `upload.mutate(file, {...})`). `DocumentItem {id,filename,status,created_at,error}` (Task 2) usado por api/hooks/página/tests. `listDocuments(token)` coincide api↔hook↔test. `useDocuments` con `['documents']`; `useUploadDocument` invalida la misma clave. data-testid `document-item` y aria-labels `archivo`/`subir` consistentes entre página (Task 3) y su test. NAV con `/documentos` (Task 3) → la página existe (Task 3). `refetchInterval` lee `query.state.data` tipado como `DocumentItem[]` (queryFn de `useDocuments`). ✅
