# Auth: 401 global + logout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An expired session (any API 401) auto-logs-out to `/login?expired=1` with a "session expired" notice, and a "Cerrar sesión" button lets the user log out on demand.

**Architecture:** A typed `ApiError` (carrying `.status`) is thrown by `apiFetch`, `streamChat`, and `uploadDocument`. `logout(reason?)` clears the token and hard-navigates to `/login`; `onAuthError(error)` calls `logout('expired')` when it sees an `ApiError` 401. The `QueryClient` wires `onAuthError` into its `QueryCache`/`MutationCache` `onError`, so every query/mutation 401 auto-logs-out. The sidebar gets a logout button; the login page shows a notice when `?expired=1`.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host). Frontend only — no backend changes.

## Global Constraints

- **One repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`. Frontend tests run on the HOST: `npx vitest run <path>` (vitest scoped to `tests/**/*.test.{ts,tsx}`).
- **`ApiError extends Error`** with a `status: number`; it is an `instanceof Error` (existing `.rejects.toThrow()` tests keep passing). Thrown by `apiFetch`, `streamChat`, `uploadDocument`.
- **`logout(reason?: 'expired')`**: SSR-guard, `clearToken()`, then `window.location.href = reason === 'expired' ? '/login?expired=1' : '/login'` (hard navigation → clears all state/cache).
- **`onAuthError(error)`**: on `ApiError` with `status === 401`, call `logout('expired')`; otherwise do nothing.
- **Global wiring**: `QueryClient` built with `QueryCache({ onError: onAuthError })` + `MutationCache({ onError: onAuthError })`.
- **Login notice** read from `?expired=1` via `window.location.search` (NOT `useSearchParams`, to avoid a Suspense boundary requirement at build).
- **No token leak**, no backend changes, no refresh-token. Dark tokens. TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).
- **Testing `window.location`:** override it per test with `Object.defineProperty(window, 'location', { value: { href: '', search: '' }, writable: true, configurable: true })` and restore it afterwards.

---

## File Structure

- `lib/api.ts` — `ApiError` class; `apiFetch` throws it.
- `lib/auth.ts` — `logout`, `onAuthError`.
- `lib/chat.ts`, `lib/documents.ts` — throw `ApiError` on non-ok.
- `app/providers.tsx` — `makeQueryClient()` wiring the cache `onError` handlers.
- `components/Sidebar.tsx` — "Cerrar sesión" button.
- `app/login/page.tsx` — expired notice.
- `app/(app)/assistant/page.tsx` — `catch` calls `onAuthError`.
- Tests: `tests/api.test.ts`, `tests/auth.test.ts`, `tests/chat-stream.test.ts`, `tests/document-upload.test.ts`, `tests/providers.test.ts` (new), `tests/shell.test.tsx`, `tests/login-expired.test.tsx` (new), `tests/assistant-page.test.tsx`.

---

### Task 1: `ApiError` + `logout` + `onAuthError` primitives

**Files:**
- Modify: `lib/api.ts`, `lib/auth.ts`
- Test: `tests/api.test.ts`, `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number }` (exported from `lib/api.ts`).
  - `logout(reason?: 'expired'): void` and `onAuthError(error: unknown): void` (exported from `lib/auth.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/api.test.ts`:

```ts
import { ApiError } from '@/lib/api'

it('apiFetch throws an ApiError carrying the status', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }))
  const err = await createTask('tok', 'p1', { title: 'x' }).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err).toBeInstanceOf(Error)
  expect((err as ApiError).status).toBe(503)
})
```
(If `tests/api.test.ts` does not already import `vi`/`createTask`, they are already used by the existing `apiFetch throws on non-ok` test — reuse the same imports.)

Append to `tests/auth.test.ts`:

```ts
import { logout, onAuthError } from '@/lib/auth'
import { ApiError } from '@/lib/api'

describe('logout / onAuthError', () => {
  let original: Location
  beforeEach(() => {
    original = window.location
    Object.defineProperty(window, 'location', {
      value: { href: '', search: '' }, writable: true, configurable: true,
    })
    localStorage.setItem('idled_token', 'tok')
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })

  it('logout clears the token and navigates to /login', () => {
    logout()
    expect(localStorage.getItem('idled_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it("logout('expired') navigates to /login?expired=1", () => {
    logout('expired')
    expect(window.location.href).toBe('/login?expired=1')
  })

  it('onAuthError logs out on an ApiError 401', () => {
    onAuthError(new ApiError('x', 401))
    expect(localStorage.getItem('idled_token')).toBeNull()
    expect(window.location.href).toBe('/login?expired=1')
  })

  it('onAuthError ignores a non-401 ApiError and plain errors', () => {
    onAuthError(new ApiError('x', 500))
    onAuthError(new Error('boom'))
    expect(localStorage.getItem('idled_token')).toBe('tok')
    expect(window.location.href).toBe('')
  })
})
```
(`describe`, `beforeEach`, `afterEach` may need adding to the vitest import in `tests/auth.test.ts`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/api.test.ts tests/auth.test.ts`
Expected: FAIL — `ApiError` / `logout` / `onAuthError` not exported.

- [ ] **Step 3: Add `ApiError` and throw it** — `lib/api.ts`

Add the class near the top (after the imports) and change the `apiFetch` throw:

```ts
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```
Change the throw inside `apiFetch`:
```ts
  if (!res.ok) {
    throw new ApiError(`API ${res.status} on ${path}`, res.status)
  }
```

- [ ] **Step 4: Add `logout` and `onAuthError`** — `lib/auth.ts`

Add the import and the two functions (at the end of the file):

```ts
import { ApiError } from '@/lib/api'

export function logout(reason?: 'expired'): void {
  if (typeof window === 'undefined') return
  clearToken()
  window.location.href = reason === 'expired' ? '/login?expired=1' : '/login'
}

export function onAuthError(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    logout('expired')
  }
}
```
> `lib/api.ts` does not import `lib/auth.ts`, so this import creates no cycle.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/api.test.ts tests/auth.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/api.ts lib/auth.ts tests/api.test.ts tests/auth.test.ts
git commit -m "feat: ApiError with status, logout, and onAuthError"
```

---

### Task 2: Propagate `ApiError` + wire the global 401 handler

**Files:**
- Modify: `lib/chat.ts`, `lib/documents.ts`, `app/providers.tsx`
- Test: `tests/chat-stream.test.ts`, `tests/document-upload.test.ts`, `tests/providers.test.ts` (create)

**Interfaces:**
- Consumes: `ApiError` (from `lib/api`), `onAuthError` (from `lib/auth`).
- Produces: `makeQueryClient(): QueryClient` (exported from `app/providers.tsx`) with cache `onError` handlers wired to `onAuthError`.

- [ ] **Step 1: Update the streamChat/upload throw tests, and write the providers test**

In `tests/chat-stream.test.ts`, change the existing "throws on a non-ok response" test to assert the `ApiError` status. Replace that test body with:

```ts
it('throws an ApiError with the status on a non-ok response', async () => {
  const { ApiError } = await import('@/lib/api')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
  const err = await streamChat('tok', { message: 'hi' }, {}).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.status).toBe(401)
})
```

In `tests/document-upload.test.ts`, change the existing "throws on a non-ok response" test to:

```ts
it('throws an ApiError with the status on a non-ok response', async () => {
  const { ApiError } = await import('@/lib/api')
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }))
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  const err = await uploadDocument('tok', file).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.status).toBe(403)
})
```

Create `tests/providers.test.ts`:

```ts
import { it, expect, beforeEach, afterEach } from 'vitest'
import { makeQueryClient } from '@/app/providers'
import { ApiError } from '@/lib/api'

let original: Location
beforeEach(() => {
  original = window.location
  Object.defineProperty(window, 'location', {
    value: { href: '', search: '' }, writable: true, configurable: true,
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
})

it('query cache logs out on a 401', () => {
  const qc = makeQueryClient()
  qc.getQueryCache().config.onError?.(new ApiError('x', 401), {} as never)
  expect(window.location.href).toBe('/login?expired=1')
})

it('mutation cache logs out on a 401', () => {
  const qc = makeQueryClient()
  qc.getMutationCache().config.onError?.(new ApiError('x', 401), undefined, undefined, {} as never)
  expect(window.location.href).toBe('/login?expired=1')
})

it('ignores a non-401 error', () => {
  const qc = makeQueryClient()
  qc.getQueryCache().config.onError?.(new ApiError('x', 500), {} as never)
  expect(window.location.href).toBe('')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/chat-stream.test.ts tests/document-upload.test.ts tests/providers.test.ts`
Expected: FAIL — `streamChat`/`uploadDocument` throw a plain `Error` (not `ApiError`), and `makeQueryClient` is not exported.

- [ ] **Step 3: Throw `ApiError` in `lib/chat.ts`**

Add the import and change the throw:

```ts
import { apiBase } from '@/lib/api'
import { ApiError } from '@/lib/api'
```
(or merge into one line: `import { apiBase, ApiError } from '@/lib/api'`.)
```ts
  if (!res.ok || !res.body) throw new ApiError(`Chat ${res.status}`, res.status)
```

- [ ] **Step 4: Throw `ApiError` in `lib/documents.ts`**

Merge the import and change the throw:

```ts
import { apiBase, ApiError } from '@/lib/api'
```
```ts
  if (!res.ok) throw new ApiError(`Upload ${res.status}`, res.status)
```

- [ ] **Step 5: Wire the global handler in `app/providers.tsx`**

Replace the file contents:

```tsx
'use client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { useState } from 'react'
import { onAuthError } from '@/lib/auth'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: onAuthError }),
    mutationCache: new MutationCache({ onError: onAuthError }),
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => makeQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/chat-stream.test.ts tests/document-upload.test.ts tests/providers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add lib/chat.ts lib/documents.ts app/providers.tsx tests/chat-stream.test.ts tests/document-upload.test.ts tests/providers.test.ts
git commit -m "feat: throw ApiError in stream/upload and wire global 401 auto-logout"
```

---

### Task 3: UI — logout button, expired notice, and the chat 401 catch

**Files:**
- Modify: `components/Sidebar.tsx`, `app/login/page.tsx`, `app/(app)/assistant/page.tsx`, `tests/shell.test.tsx`, `tests/assistant-page.test.tsx`
- Test: `tests/login-expired.test.tsx` (create)

**Interfaces:**
- Consumes: `logout`, `onAuthError` (from `lib/auth`), `ApiError` (from `lib/api`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/shell.test.tsx` (it already imports `Sidebar`-related helpers and `* as auth`; add `fireEvent` to the `@testing-library/react` import):

```tsx
it('the logout button calls logout', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const logoutSpy = vi.spyOn(auth, 'logout').mockImplementation(() => {})
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  fireEvent.click(screen.getByLabelText('cerrar sesión'))
  expect(logoutSpy).toHaveBeenCalled()
})
```
> If `tests/shell.test.tsx` imports `Sidebar` statically at the top, reuse that import instead of the dynamic `await import` and drop the local `const { default: Sidebar }` line.

Append to `tests/assistant-page.test.tsx` (add `import * as auth from '@/lib/auth'` and `import { ApiError } from '@/lib/api'` at the top):

```tsx
it('logs out when the stream fails with a 401', async () => {
  const onAuthErrorSpy = vi.spyOn(auth, 'onAuthError').mockImplementation(() => {})
  stub((() => Promise.reject(new ApiError('x', 401))) as never)
  const { default: Page } = await import('@/app/(app)/assistant/page')
  wrap(<Page />)
  fireEvent.change(screen.getByLabelText('mensaje'), { target: { value: 'hola' } })
  fireEvent.click(screen.getByLabelText('enviar'))
  await new Promise((r) => setTimeout(r, 0))
  expect(onAuthErrorSpy).toHaveBeenCalled()
})
```
> This file already has a `wrap()` helper (it mounts the page inside a `QueryClientProvider`) used by its other tests — call `wrap(<Page />)` exactly as they do. The `stub()` helper in this file already spies `useConversations`/`useMessages`/`streamChat` etc.; passing the reject implementation to `stub(...)` overrides `streamChat`.

Create `tests/login-expired.test.tsx`:

```tsx
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let original: Location
beforeEach(() => {
  original = window.location
  Object.defineProperty(window, 'location', {
    value: { href: '', search: '' }, writable: true, configurable: true,
  })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
})

it('shows the expired notice when ?expired=1 is present', async () => {
  ;(window.location as unknown as { search: string }).search = '?expired=1'
  const { default: Login } = await import('@/app/login/page')
  render(<Login />)
  expect(await screen.findByRole('alert')).toHaveTextContent('caducado')
})

it('shows no expired notice without the flag', async () => {
  ;(window.location as unknown as { search: string }).search = ''
  const { default: Login } = await import('@/app/login/page')
  render(<Login />)
  expect(screen.queryByRole('alert')).toBeNull()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/shell.test.tsx tests/assistant-page.test.tsx tests/login-expired.test.tsx`
Expected: FAIL — no logout button, no expired notice, assistant catch doesn't call `onAuthError`.

- [ ] **Step 3: Add the logout button** — `components/Sidebar.tsx`

Add the import and a button pushed to the bottom of the `<aside>` (which is already `display: flex; flexDirection: column`). Import:

```tsx
import { logout } from '@/lib/auth'
```
Add, immediately before the closing `</aside>` (after the `<nav>…</nav>`):

```tsx
      <button aria-label="cerrar sesión" onClick={() => logout()}
        style={{ ...itemStyle, marginTop: 'auto', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', opacity: 0.8 }}>
        Cerrar sesión
      </button>
```
> `itemStyle` already exists in this file (used by the nav links). Reusing it keeps the button visually consistent.

- [ ] **Step 4: Add the expired notice** — `app/login/page.tsx`

Add `useEffect` to the react import, an `expired` state, the effect, and the notice in the form. Change the import line:

```tsx
import { useEffect, useState } from 'react'
```
Add the state + effect inside `LoginPage`, after the existing `useState` lines:

```tsx
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expired') === '1') setExpired(true)
  }, [])
```
Render the notice just below the `<h1>` (before the email input):

```tsx
        {expired && <p role="alert" style={{ color: 'var(--red)', marginBottom: 12 }}>Tu sesión ha caducado. Vuelve a entrar.</p>}
```

- [ ] **Step 5: Call `onAuthError` in the assistant catch** — `app/(app)/assistant/page.tsx`

Add the import:

```tsx
import { getToken, onAuthError } from '@/lib/auth'
```
(merge with the existing `import { getToken } from '@/lib/auth'`.)

Change the `catch` block in `send()` to capture and forward the error:

```tsx
    } catch (err) {
      onAuthError(err)
      setError('⚠️ Error al responder. Inténtalo de nuevo.')
      setPending(null)
      return
    }
```

- [ ] **Step 6: Run the targeted tests, the full suite, and the build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/shell.test.tsx tests/assistant-page.test.tsx tests/login-expired.test.tsx
npx vitest run
npm run build
```
Expected: the targeted tests pass; full suite passes; build compiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add components/Sidebar.tsx app/login/page.tsx "app/(app)/assistant/page.tsx" tests/shell.test.tsx tests/assistant-page.test.tsx tests/login-expired.test.tsx
git commit -m "feat: logout button, session-expired notice, and chat 401 handling"
```

---

## Out of scope (this plan)

- Refresh tokens / renovación automática, "recuérdame", expiración proactiva por tiempo.
- SSO real con cookies httpOnly (sigue localStorage en dev).
- Otros fast-follows (`--text-muted`, formato de fechas, flash de estados vacíos, `useCallback` en Esc, etc.).

## Self-Review

**Spec coverage:**
- `ApiError` (con status) lanzado por `apiFetch` → Task 1; por `streamChat`/`uploadDocument` → Task 2. ✅
- `logout(reason?)` + `onAuthError` → Task 1. ✅
- `QueryCache`/`MutationCache` `onError: onAuthError` → Task 2 (`makeQueryClient`). ✅
- Botón "Cerrar sesión" (sidebar) → Task 3. ✅
- Aviso `?expired=1` en login → Task 3. ✅
- Chat: catch → `onAuthError` → Task 3. ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo. La única nota condicional (render de la página del asistente "como los otros tests de ese fichero") es una instrucción de estilo de test, no un placeholder de código — el implementador ve el `wrap()` existente en ese fichero. ✅

**Type consistency:** `ApiError(message, status)` con `.status` coincide entre Task 1 (def en api.ts), su uso en `auth.ts`/`chat.ts`/`documents.ts` (Tasks 1–2) y todos los tests. `logout(reason?: 'expired')` / `onAuthError(error: unknown)` coinciden entre def (Task 1), `makeQueryClient` (Task 2), sidebar/assistant (Task 3) y tests. `makeQueryClient()` exportado (Task 2) usado por `Providers` y `tests/providers.test.ts`. aria-label `cerrar sesión` (Task 3) coincide sidebar↔test. El aviso de login se detecta por `role="alert"` con texto "caducado" (Task 3) — el `<p>` de error de login NO tiene role, así que `queryByRole('alert')` no colisiona. ✅
