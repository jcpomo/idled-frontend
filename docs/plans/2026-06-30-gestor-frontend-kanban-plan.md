# Gestor Frontend — Login + Dashboard + Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un frontend Next.js con el diseño dark del cliente que: hace login (mini-Laravel → JWT), lista proyectos en un Dashboard, abre un proyecto y muestra un tablero **Kanban** (columnas open/progress/review/done) donde se crean tareas y se arrastran entre columnas — todo contra el backend FastAPI ya existente (`/api/projects`, `/api/tasks`).

**Architecture:** Repo nuevo `idled-frontend` (Next.js 14.2 App Router, TypeScript, Tailwind con los tokens dark del handoff). Se **reutiliza la capa visual del intento previo `imasd-gestor`** (mismo diseño dark, Kanban con `@dnd-kit`) PORTÁNDOLA y sustituyendo su capa de datos Supabase por un cliente HTTP tipado contra el backend FastAPI + **TanStack Query**. Auth: login contra el mini-Laravel que devuelve el JWT; el token se guarda en el cliente y se envía como `Authorization: Bearer` a cada llamada del backend (token passthrough). Despliegue futuro en Vercel.

**Tech Stack:** Next.js 14.2 + React 18, TypeScript, TailwindCSS, `@tanstack/react-query`, `@dnd-kit/*`, `vitest` + `@testing-library/react` + `jsdom` (tests de componente/lógica por tarea), Playwright (smoke e2e final). Toolchain en el HOST (Node 26 / npm 11), NO Docker.

## Global Constraints

- **Toolchain en host:** todos los comandos del frontend corren en el host dentro de `idled-frontend/`: `npm install`, `npx vitest run <ruta>`, `npm run build`, `npx playwright test`. (El backend sigue en Docker, en el otro repo.)
- **Diseño dark — tokens exactos (del handoff):** fondo `#080808`, acento `#FAC51C`, verde `#46C26A`, azul `#4FB6E8`, rojo `#E5484D`, naranja `#FF7F24`; fuentes **Outfit** (sans) + **JetBrains Mono** (mono). Sombras de fondo `--bg`..`--bg-5` y `--border rgba(255,255,255,.07)` (portar `globals.css` de imasd-gestor verbatim).
- **Estados/columnas Kanban (del backend/diseño):** `open`→"OPEN", `progress`→"IN PROGRESS", `review`→"REVIEW", `done`→"DONE". El orden de columnas es ese.
- **Contrato del backend (no inventar formas):**
  - `GET /api/projects` → `[{id, name, created_at}]`; `POST /api/projects {name}` → `{id, name}`.
  - `GET /api/projects/{id}/tasks` → `[{id, title, task_type, status, assignee, due_date, position}]`; `POST /api/projects/{id}/tasks {title, task_type?, status?, assignee?, due_date?}` → task.
  - `PATCH /api/tasks/{id} {title?, task_type?, assignee?, due_date?}`; `POST /api/tasks/{id}/move {status, position}` → task.
  - Auth backend: `Authorization: Bearer <jwt>` en cada request.
  - Login dev: `POST {ERP}/api/login {email}` → `{token}` (mini-Laravel). Usuarios seed: `ana@idled.test`, `leo@idled.test`, `pro@idled.test`.
- **Config por entorno:** `NEXT_PUBLIC_API_URL` (backend, p.ej. `http://localhost:8000`) y `NEXT_PUBLIC_ERP_URL` (mini-Laravel, `http://localhost:8080`). Diferencia local↔Vercel = solo estas envs.
- **Reuso de imasd-gestor:** la capa VISUAL (markup/estilos/sidebar/cards) se porta de `../imasd-gestor`. La capa de DATOS (Supabase, realtime, `activity_log`, `profiles`, `task_types`) se ELIMINA y se sustituye por el cliente API + hooks. No copiar `@supabase/*` ni `lib/supabase`.
- TDD: cada tarea con tests vitest que fallan → implementación → pasan → commit. La fidelidad visual pixel-perfect NO se valida con vitest (eso es el smoke Playwright final + revisión manual); vitest valida comportamiento/datos.

---

## File Structure

```
idled-frontend/
  package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.mjs
  vitest.config.ts, vitest.setup.ts
  app/
    globals.css                 — tokens dark (portado de imasd-gestor)
    layout.tsx                  — root layout (fuentes, QueryProvider)
    page.tsx                    — redirect a /dashboard o /login según sesión
    providers.tsx               — QueryClientProvider + AuthProvider
    login/page.tsx              — login (mini-Laravel)
    (app)/layout.tsx            — shell con sidebar dark + guard de sesión
    (app)/dashboard/page.tsx    — lista de proyectos + crear
    (app)/project/[id]/page.tsx — tablero Kanban
  components/
    kanban/Board.tsx            — columnas + DnD
    kanban/TaskCard.tsx         — tarjeta de tarea (visual dark)
    kanban/Column.tsx           — columna droppable + crear tarea
  lib/
    types.ts                    — Project, Task, TaskStatus
    api.ts                      — cliente HTTP tipado (backend)
    auth.ts                     — login mini-Laravel + token store
    queries.ts                  — hooks TanStack Query
  e2e/
    smoke.spec.ts               — Playwright (login→proyecto→tarea→mover)
```

---

### Task 1: Scaffold + shell dark + harness de tests

**Files:**
- Create (in `idled-frontend/`): `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `.gitignore`, `.env.local`, `.env.example`, `tests/smoke.test.tsx`

**Interfaces:**
- Produces: a buildable Next.js 14.2 app with the dark tokens + a working `vitest` harness. `npm run dev` serves; `npx vitest run` runs tests.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "idled-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "14.2.35",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tanstack/react-query": "^5.59.0",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.0",
    "@vitejs/plugin-react": "^4.3.1"
  }
}
```

- [ ] **Step 2: Create the config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
```
`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```
`tailwind.config.ts` (tokens from imasd-gestor):
```ts
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { accent: '#FAC51C', green: '#46C26A', blue: '#4FB6E8', red: '#E5484D', orange: '#FF7F24' },
    fontFamily: { sans: ['Outfit', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
  } },
  plugins: [],
}
export default config
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```
`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Port the dark globals + create the root layout**

Read `../imasd-gestor/app/globals.css` and copy it verbatim to `app/globals.css` (the `@import` of Outfit/JetBrains, the `:root` token vars, and the base body styles). Create `app/layout.tsx`:
```tsx
import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Gestor IMASD', description: 'Gestor de proyectos' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```
Create `app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/dashboard')
}
```

- [ ] **Step 4: Create `.gitignore`, `.env.example`, `.env.local`**

`.gitignore`:
```
/node_modules
/.next
/out
.env.local
/playwright-report
/test-results
```
`.env.example` AND `.env.local` (same content):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ERP_URL=http://localhost:8080
```

- [ ] **Step 5: Write the smoke test** — `tests/smoke.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <h1>Gestor IMASD</h1>
}

describe('test harness', () => {
  it('renders a component', () => {
    render(<Hello />)
    expect(screen.getByRole('heading', { name: 'Gestor IMASD' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Install, run the smoke test, and verify the build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npm install
npx vitest run tests/smoke.test.tsx
npm run build
```
Expected: `npm install` succeeds; the smoke test passes; `next build` completes with no errors (the `/` and root layout compile).

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
git add -A
git commit -m "chore: scaffold Next.js frontend with dark tokens and vitest harness"
```

---

### Task 2: Tipos + cliente API tipado

**Files:**
- Create: `lib/types.ts`, `lib/api.ts`, `tests/api.test.ts`

**Interfaces:**
- Produces:
  - `lib/types.ts`: `TaskStatus = 'open' | 'progress' | 'review' | 'done'`; `Project = { id: string; name: string; created_at?: string | null }`; `Task = { id: string; title: string; task_type: string; status: TaskStatus; assignee: string | null; due_date: string | null; position: number }`.
  - `lib/api.ts`: `apiFetch<T>(path: string, opts: { method?: string; body?: unknown; token: string }): Promise<T>` (base = `NEXT_PUBLIC_API_URL`, adds `Authorization: Bearer`, JSON). Plus typed wrappers: `listProjects(token)`, `createProject(token, name)`, `listTasks(token, projectId)`, `createTask(token, projectId, input)`, `updateTask(token, taskId, patch)`, `moveTask(token, taskId, status, position)`.

- [ ] **Step 1: Write the failing test** — `tests/api.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listProjects, createTask, moveTask } from '@/lib/api'

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://backend'
  vi.restoreAllMocks()
})

it('listProjects GETs with bearer token', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, json: async () => [{ id: 'p1', name: 'Serie X' }],
  })
  vi.stubGlobal('fetch', fetchMock)
  const out = await listProjects('tok')
  expect(out[0].name).toBe('Serie X')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://backend/api/projects')
  expect(init.headers.Authorization).toBe('Bearer tok')
})

it('moveTask POSTs status+position', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ id: 't1', status: 'done', position: 0 }),
  })
  vi.stubGlobal('fetch', fetchMock)
  await moveTask('tok', 't1', 'done', 0)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://backend/api/tasks/t1/move')
  expect(JSON.parse(init.body)).toEqual({ status: 'done', position: 0 })
})

it('apiFetch throws on non-ok', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }))
  await expect(createTask('tok', 'p1', { title: 'x' })).rejects.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/api.test.ts`
Expected: FAIL — cannot resolve `@/lib/api`.

- [ ] **Step 3: Create `lib/types.ts`**

```ts
export type TaskStatus = 'open' | 'progress' | 'review' | 'done'

export interface Project {
  id: string
  name: string
  created_at?: string | null
}

export interface Task {
  id: string
  title: string
  task_type: string
  status: TaskStatus
  assignee: string | null
  due_date: string | null
  position: number
}
```

- [ ] **Step 4: Create `lib/api.ts`**

```ts
import type { Project, Task, TaskStatus } from '@/lib/types'

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
}

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; token: string },
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  if (!res.ok) {
    throw new Error(`API ${res.status} on ${path}`)
  }
  return (await res.json()) as T
}

export const listProjects = (token: string) =>
  apiFetch<Project[]>('/api/projects', { token })

export const createProject = (token: string, name: string) =>
  apiFetch<Project>('/api/projects', { method: 'POST', body: { name }, token })

export const listTasks = (token: string, projectId: string) =>
  apiFetch<Task[]>(`/api/projects/${projectId}/tasks`, { token })

export const createTask = (
  token: string,
  projectId: string,
  input: { title: string; task_type?: string; status?: TaskStatus; assignee?: string | null; due_date?: string | null },
) => apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: input, token })

export const updateTask = (
  token: string,
  taskId: string,
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null },
) => apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch, token })

export const moveTask = (token: string, taskId: string, status: TaskStatus, position: number) =>
  apiFetch<Task>(`/api/tasks/${taskId}/move`, { method: 'POST', body: { status, position }, token })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/api.test.ts`
Expected: PASS (all three)

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: typed API client and domain types for the backend"
```

---

### Task 3: Auth (login mini-Laravel + token store + login page)

**Files:**
- Create: `lib/auth.ts`, `app/login/page.tsx`, `tests/auth.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_ERP_URL`.
- Produces:
  - `lib/auth.ts`: `login(email: string): Promise<string>` (POSTs `{email}` to `${ERP}/api/login`, returns the JWT, throws on failure); `saveToken(token)`, `getToken(): string | null`, `clearToken()` (localStorage key `idled_token`).
  - `app/login/page.tsx`: a dark login form (email field, "Entrar" button) that calls `login`, saves the token, and `router.push('/dashboard')`.

- [ ] **Step 1: Write the failing test** — `tests/auth.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { login, saveToken, getToken, clearToken } from '@/lib/auth'

beforeEach(() => {
  process.env.NEXT_PUBLIC_ERP_URL = 'http://erp'
  localStorage.clear()
  vi.restoreAllMocks()
})

it('login posts email and returns token', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'jwt-123' }) })
  vi.stubGlobal('fetch', fetchMock)
  const tok = await login('ana@idled.test')
  expect(tok).toBe('jwt-123')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('http://erp/api/login')
  expect(JSON.parse(init.body)).toEqual({ email: 'ana@idled.test' })
})

it('login throws on bad credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
  await expect(login('nope@x.test')).rejects.toThrow()
})

it('token store roundtrip', () => {
  expect(getToken()).toBeNull()
  saveToken('abc')
  expect(getToken()).toBe('abc')
  clearToken()
  expect(getToken()).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Create `lib/auth.ts`**

```ts
const TOKEN_KEY = 'idled_token'

function erpBase(): string {
  return process.env.NEXT_PUBLIC_ERP_URL ?? 'http://localhost:8080'
}

export async function login(email: string): Promise<string> {
  const res = await fetch(`${erpBase()}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    throw new Error('Credenciales inválidas')
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
```

- [ ] **Step 4: Create `app/login/page.tsx`** (port the dark login look from `../imasd-gestor/app/auth/login/page.tsx`, but use OUR `login`/`saveToken`; a single email field + submit; no Supabase, no password)

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, saveToken } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('ana@idled.test')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const token = await login(email)
      saveToken(token)
      router.push('/dashboard')
    } catch {
      setError('No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <form onSubmit={onSubmit} style={{ width: 320, padding: 24, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <h1 style={{ fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>IMASD</h1>
        <input
          aria-label="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
        />
        {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 10, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600 }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Run the auth tests**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/auth.test.ts`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: mini-Laravel login, token store, and dark login page"
```

---

### Task 4: Providers + hooks de datos (TanStack Query)

**Files:**
- Create: `app/providers.tsx`, `lib/queries.ts`, `tests/queries.test.tsx`

**Interfaces:**
- Consumes: `lib/api` functions, `getToken`.
- Produces:
  - `app/providers.tsx`: `Providers` client component wrapping children in a `QueryClientProvider`.
  - `lib/queries.ts`: hooks `useProjects()`, `useCreateProject()`, `useTasks(projectId)`, `useCreateTask(projectId)`, `useMoveTask(projectId)` — each reads the token via `getToken()` and calls the matching `lib/api` function; mutations invalidate the relevant query key (`['projects']` or `['tasks', projectId]`).

- [ ] **Step 1: Write the failing test** — `tests/queries.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as api from '@/lib/api'
import * as auth from '@/lib/auth'
import { useProjects } from '@/lib/queries'

beforeEach(() => vi.restoreAllMocks())

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

it('useProjects loads projects via the api with the token', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  vi.spyOn(api, 'listProjects').mockResolvedValue([{ id: 'p1', name: 'Serie X' }])
  const { result } = renderHook(() => useProjects(), { wrapper: wrapper() })
  await waitFor(() => expect(result.current.data).toBeDefined())
  expect(result.current.data![0].name).toBe('Serie X')
  expect(api.listProjects).toHaveBeenCalledWith('tok')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/queries.test.tsx`
Expected: FAIL — cannot resolve `@/lib/queries`.

- [ ] **Step 3: Create `app/providers.tsx`**

```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 4: Create `lib/queries.ts`**

```ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { TaskStatus } from '@/lib/types'

function token(): string {
  return getToken() ?? ''
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.listProjects(token()) })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createProject(token(), name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => api.listTasks(token(), projectId),
    enabled: Boolean(projectId),
  })
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; status?: TaskStatus }) =>
      api.createTask(token(), projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}

export function useMoveTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { taskId: string; status: TaskStatus; position: number }) =>
      api.moveTask(token(), v.taskId, v.status, v.position),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/queries.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: TanStack Query provider and data hooks"
```

---

### Task 5: Shell con sidebar dark + guard de sesión

**Files:**
- Create: `app/(app)/layout.tsx`, `components/Sidebar.tsx`, `tests/shell.test.tsx`
- Modify: `app/layout.tsx` (wrap children in `Providers`)

**Interfaces:**
- Consumes: `Providers`, `getToken`.
- Produces: `(app)/layout.tsx` — a client layout that renders the dark `Sidebar` + the page; if `getToken()` is null it redirects to `/login`. `Sidebar` ports the dark sidebar look from `../imasd-gestor/app/(app)/layout.tsx` (logo "IMASD", nav links Dashboard / Equipo / Notificaciones / Chat — only Dashboard is wired now; the rest are static placeholders for later slices).

> Port the sidebar MARKUP/STYLES from imasd-gestor; do NOT bring any Supabase/session code from it — use OUR `getToken`.

- [ ] **Step 1: Wrap the root layout** — modify `app/layout.tsx` body:
```tsx
import { Providers } from './providers'
// ...
      <body><Providers>{children}</Providers></body>
```

- [ ] **Step 2: Write the failing test** — `tests/shell.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as auth from '@/lib/auth'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

beforeEach(() => { pushMock.mockClear(); vi.restoreAllMocks() })

it('renders the sidebar nav when authenticated', async () => {
  vi.spyOn(auth, 'getToken').mockReturnValue('tok')
  const { default: Sidebar } = await import('@/components/Sidebar')
  render(<Sidebar />)
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/shell.test.tsx`
Expected: FAIL — cannot resolve `@/components/Sidebar`.

- [ ] **Step 4: Create `components/Sidebar.tsx`** (dark sidebar; port the look from imasd-gestor)

```tsx
'use client'
import Link from 'next/link'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chat', label: 'Chat de equipo' },
  { href: '/notifications', label: 'Notificaciones' },
  { href: '/team', label: 'Equipo' },
]

export default function Sidebar() {
  return (
    <aside style={{ width: 250, flex: '0 0 250px', background: '#565656', borderRight: '1px solid rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', padding: '18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <span style={{ fontWeight: 700, letterSpacing: '.06em', fontSize: 15, color: 'var(--text)' }}>IMASD</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} style={{ padding: '8px 10px', borderRadius: 8, color: 'var(--text)', textDecoration: 'none' }}>
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 5: Create `app/(app)/layout.tsx`** (guard + shell)

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (!getToken()) router.push('/login')
  }, [router])
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Run the test + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/shell.test.tsx
npm run build
```
Expected: test passes; build compiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: dark app shell with sidebar and session guard"
```

---

### Task 6: Dashboard (lista de proyectos + crear)

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: `useProjects`, `useCreateProject`.
- Produces: `(app)/dashboard/page.tsx` — lists the user's projects as dark cards (each links to `/project/{id}`), plus a "Nuevo proyecto" input + button that calls `useCreateProject`. Port the card/grid look from `../imasd-gestor/app/(app)/dashboard/page.tsx`, but data comes from `useProjects` (no Supabase).

- [ ] **Step 1: Write the failing test** — `tests/dashboard.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import * as queries from '@/lib/queries'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
beforeEach(() => vi.restoreAllMocks())

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

it('lists projects from the hook', async () => {
  vi.spyOn(queries, 'useProjects').mockReturnValue({ data: [{ id: 'p1', name: 'Serie X' }], isLoading: false } as any)
  vi.spyOn(queries, 'useCreateProject').mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
  const { default: Dashboard } = await import('@/app/(app)/dashboard/page')
  wrap(<Dashboard />)
  expect(await screen.findByText('Serie X')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/dashboard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/(app)/dashboard/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useProjects, useCreateProject } from '@/lib/queries'

export default function Dashboard() {
  const { data: projects, isLoading } = useProjects()
  const create = useCreateProject()
  const [name, setName] = useState('')

  return (
    <div style={{ padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Proyectos</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          aria-label="nuevo proyecto" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del proyecto"
          style={{ padding: 8, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
        />
        <button
          onClick={() => { if (name.trim()) { create.mutate(name.trim()); setName('') } }}
          disabled={create.isPending}
          style={{ padding: '8px 14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 600 }}>
          Nuevo proyecto
        </button>
      </div>
      {isLoading ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {(projects ?? []).map((p) => (
            <Link key={p.id} href={`/project/${p.id}`}
              style={{ display: 'block', padding: 16, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', textDecoration: 'none' }}>
              {p.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: dashboard project list and create"
```

---

### Task 7: Tablero Kanban (render por columnas)

**Files:**
- Create: `components/kanban/TaskCard.tsx`, `components/kanban/Board.tsx`, `app/(app)/project/[id]/page.tsx`, `tests/board.test.tsx`

**Interfaces:**
- Consumes: `useTasks`, `Task`/`TaskStatus`.
- Produces:
  - `components/kanban/TaskCard.tsx`: `TaskCard({ task }: { task: Task })` — a dark card showing title, task_type, assignee/due_date. Port the card visual from imasd-gestor's kanban.
  - `components/kanban/Board.tsx`: `Board({ projectId }: { projectId: string })` — loads `useTasks(projectId)`, groups by status, renders 4 columns (`COLUMNS = [{key:'open',label:'OPEN'},{key:'progress',label:'IN PROGRESS'},{key:'review',label:'REVIEW'},{key:'done',label:'DONE'}]`), each column lists its tasks ordered by `position`.
  - `(app)/project/[id]/page.tsx`: reads `params.id` and renders `<Board projectId={params.id} />`.

- [ ] **Step 1: Write the failing test** — `tests/board.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import * as queries from '@/lib/queries'
import type { Task } from '@/lib/types'

beforeEach(() => vi.restoreAllMocks())

const tasks: Task[] = [
  { id: 't1', title: 'Estudio viabilidad', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 0 },
  { id: 't2', title: 'Render frontal', task_type: 'NUEVO DISEÑO', status: 'progress', assignee: 'CR', due_date: null, position: 0 },
  { id: 't3', title: 'Alta artículo ERP', task_type: 'PPTO', status: 'done', assignee: 'BR', due_date: null, position: 0 },
]

it('renders tasks grouped into status columns', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as any)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as any)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as any)
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  const open = screen.getByTestId('column-open')
  expect(within(open).getByText('Estudio viabilidad')).toBeInTheDocument()
  const done = screen.getByTestId('column-done')
  expect(within(done).getByText('Alta artículo ERP')).toBeInTheDocument()
  // task in 'progress' must not appear in the 'open' column
  expect(within(open).queryByText('Render frontal')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/board.test.tsx`
Expected: FAIL — cannot resolve `@/components/kanban/Board`.

- [ ] **Step 3: Create `components/kanban/TaskCard.tsx`**

```tsx
'use client'
import type { Task } from '@/lib/types'

export default function TaskCard({ task }: { task: Task }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, color: 'var(--text)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{task.title}</div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#bbb' }}>
        <span className="mono">{task.task_type}</span>
        {task.assignee && <span>· {task.assignee}</span>}
        {task.due_date && <span>· {task.due_date}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/kanban/Board.tsx`**

```tsx
'use client'
import { useTasks } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import TaskCard from './TaskCard'

export const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'open', label: 'OPEN' },
  { key: 'progress', label: 'IN PROGRESS' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
]

export default function Board({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>
  const byStatus = (s: TaskStatus) =>
    (tasks ?? []).filter((t: Task) => t.status === s).sort((a, b) => a.position - b.position)
  return (
    <div style={{ display: 'flex', gap: 14, padding: 24, height: '100%', overflowX: 'auto' }}>
      {COLUMNS.map((col) => (
        <div key={col.key} data-testid={`column-${col.key}`}
          style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{col.label}</div>
          {byStatus(col.key).map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `app/(app)/project/[id]/page.tsx`**

```tsx
import Board from '@/components/kanban/Board'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <Board projectId={params.id} />
}
```

- [ ] **Step 6: Run test + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/board.test.tsx
npm run build
```
Expected: test passes; build compiles.

- [ ] **Step 7: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: Kanban board rendering tasks grouped by status column"
```

---

### Task 8: Interacciones Kanban (crear tarea + drag-drop mover)

**Files:**
- Create: `components/kanban/Column.tsx`, `tests/kanban-interactions.test.tsx`
- Modify: `components/kanban/Board.tsx` (add `@dnd-kit` DnD context + per-column create)

**Interfaces:**
- Consumes: `useCreateTask`, `useMoveTask`, `@dnd-kit/core`.
- Produces:
  - `components/kanban/Column.tsx`: a droppable column (via `useDroppable({ id: status })`) that renders its `TaskCard`s (each draggable via `useDraggable({ id: taskId })`) + a small "+ tarea" input that calls `onCreate(title)`.
  - `Board.tsx` updated: wraps the columns in `<DndContext onDragEnd={...}>`; on drop over a column, calls `useMoveTask().mutate({ taskId, status: targetColumn, position: <count in target column> })` (append to the end of the target column). Each column's create calls `useCreateTask().mutate({ title })` with that column's status.

> Behavioral focus for vitest: assert that a simulated drop calls `moveTask` with the target status, and that the create input calls `createTask`. Pixel-level DnD animation is validated by the Playwright smoke (Task 9), not here. Use `@dnd-kit`'s `onDragEnd` handler directly in the test by invoking the Board's drop logic through a fired event, OR extract the drop handler into a pure function `resolveMove(activeId, overId, tasks)` and unit-test that.

- [ ] **Step 1: Write the failing test** — `tests/kanban-interactions.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { resolveMove } from '@/components/kanban/Board'
import type { Task } from '@/lib/types'

const tasks: Task[] = [
  { id: 'a', title: 'a', task_type: 'PPTO', status: 'open', assignee: null, due_date: null, position: 0 },
  { id: 'b', title: 'b', task_type: 'PPTO', status: 'done', assignee: null, due_date: null, position: 0 },
]

it('resolveMove computes target status and append position', () => {
  // drop task 'a' over the 'done' column -> status done, position = count in done (1)
  expect(resolveMove('a', 'done', tasks)).toEqual({ taskId: 'a', status: 'done', position: 1 })
})

it('resolveMove returns null when dropped outside a column', () => {
  expect(resolveMove('a', null, tasks)).toBeNull()
})

it('resolveMove returns null for an unknown column', () => {
  expect(resolveMove('a', 'nope', tasks)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/kanban-interactions.test.tsx`
Expected: FAIL — `resolveMove` is not exported.

- [ ] **Step 3: Add `resolveMove` + DnD wiring to `components/kanban/Board.tsx`**

Add this exported pure helper (it is the testable core of the drop logic) and wire `DndContext` around the columns. Append to `Board.tsx`:

```ts
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { useCreateTask, useMoveTask } from '@/lib/queries'

const COLUMN_KEYS: TaskStatus[] = ['open', 'progress', 'review', 'done']

export function resolveMove(
  activeId: string,
  overId: string | null,
  tasks: Task[],
): { taskId: string; status: TaskStatus; position: number } | null {
  if (!overId || !COLUMN_KEYS.includes(overId as TaskStatus)) return null
  const status = overId as TaskStatus
  const position = tasks.filter((t) => t.status === status).length
  return { taskId: activeId, status, position }
}
```

Then change the `Board` component body to wrap the columns in `<DndContext onDragEnd={onDragEnd}>`, where:
```tsx
  const move = useMoveTask(projectId)
  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.id ? String(e.over.id) : null
    const plan = resolveMove(String(e.active.id), over, tasks ?? [])
    if (plan) move.mutate(plan)
  }
```
and replace each inline column block with `<Column status={col.key} label={col.label} tasks={byStatus(col.key)} onCreate={(title) => createForColumn(col.key, title)} />`, with:
```tsx
  const create = useCreateTask(projectId)
  function createForColumn(status: TaskStatus, title: string) {
    create.mutate({ title, status })
  }
```

- [ ] **Step 4: Create `components/kanban/Column.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import type { Task, TaskStatus } from '@/lib/types'
import TaskCard from './TaskCard'

function Draggable({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <TaskCard task={task} />
    </div>
  )
}

export default function Column({
  status, label, tasks, onCreate,
}: { status: TaskStatus; label: string; tasks: Task[]; onCreate: (title: string) => void }) {
  const { setNodeRef } = useDroppable({ id: status })
  const [title, setTitle] = useState('')
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`}
      style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{label}</div>
      {tasks.map((t) => <Draggable key={t.id} task={t} />)}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input aria-label={`nueva tarea ${status}`} value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="+ tarea"
          style={{ flex: 1, padding: 6, background: 'var(--bg-4)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} />
        <button onClick={() => { if (title.trim()) { onCreate(title.trim()); setTitle('') } }}
          style={{ padding: '6px 8px', background: 'var(--bg-5)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 }}>+</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the interaction test + the board render test + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/kanban-interactions.test.tsx tests/board.test.tsx
npm run build
```
Expected: all pass; build compiles. (The board test still renders columns; the `Column` now provides the `data-testid`.)

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "feat: Kanban drag-to-move and per-column task creation"
```

---

### Task 9: Smoke e2e con Playwright (login → proyecto → tarea → mover)

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` (add `@playwright/test` devDep + `e2e` script)

**Interfaces:**
- Consumes: the running backend stack (api:8000 + mini-laravel:8080 via docker compose in the BACKEND repo) and the frontend dev server (`npm run dev` on :3000).
- Produces: a Playwright spec that logs in as `ana@idled.test`, creates a project, opens it, adds a task in the OPEN column, drags it to DONE, and asserts it appears under DONE.

> This is the only test that needs the full stack. It is run manually/locally, not in the vitest suite.

- [ ] **Step 1: Add Playwright** — add to `package.json` devDependencies `"@playwright/test": "^1.48.0"` and a script `"e2e": "playwright test"`. Then:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npm install
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 3: Create `e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('login, create project, add task, move to done', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('email').fill('ana@idled.test')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  const projectName = `E2E ${Date.now()}`
  await page.getByLabel('nuevo proyecto').fill(projectName)
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click()
  await page.getByText(projectName).click()

  await page.getByLabel('nueva tarea open').fill('Tarea E2E')
  await page.locator('[data-testid="column-open"] button', { hasText: '+' }).click()
  await expect(page.locator('[data-testid="column-open"]')).toContainText('Tarea E2E')

  // drag the card from OPEN to DONE
  const card = page.locator('[data-testid="column-open"]').getByText('Tarea E2E')
  const done = page.locator('[data-testid="column-done"]')
  await card.dragTo(done)
  await expect(done).toContainText('Tarea E2E')
})
```

- [ ] **Step 4: Run the e2e against the full stack**

Bring up the BACKEND stack first (in the backend repo): `docker compose up -d --build`. Then:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx playwright test
```
Expected: PASS — the flow logs in, creates a project, adds and moves a task. If the drag assertion is flaky in headless Chromium, report it (dnd-kit + Playwright dragTo can need pointer steps); the create + render assertions must pass regardless.

- [ ] **Step 5: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add -A
git commit -m "test: Playwright smoke for login -> project -> task -> move"
```

---

## Out of scope (this plan)

- **Vistas Lista y Gantt** del proyecto, **detalle de tarea** (panel lateral con subtareas/comentarios/checklist/etiquetas/time tracker), **chat de equipo, notificaciones, gestión de equipo** → slices posteriores (los links del sidebar quedan como placeholders).
- **Reordenado fino dentro de una columna** (drop entre dos tarjetas en un índice exacto): por ahora el drop AÑADE al final de la columna destino. Insertar en índice exacto → mejora posterior.
- **SSO real / cookies httpOnly**: el token se guarda en localStorage para desarrollo (login contra mini-Laravel). Endurecer (cookie httpOnly, refresh) → posterior.
- **Autogeneración de tipos desde el OpenAPI** del backend (openapi-typescript): de momento los tipos están a mano (superficie pequeña).
- **Realtime** (websockets) del tablero → posterior.
- **Upgrade a Next.js 15**: se fija 14.2 para portar limpio desde imasd-gestor; subir a 15 es una tarea posterior aislada.

---

## Self-Review

**Spec coverage (vs arquitectura §9 frontend + diseño dark handoff):**
- Login (mini-Laravel → JWT) → Task 3. ✅
- Dashboard (lista de proyectos + crear) → Task 6. ✅
- Tablero Kanban (columnas open/progress/review/done) → Task 7. ✅
- Crear tarea + drag-drop mover (→ /api/tasks/{id}/move) → Task 8. ✅
- Diseño dark (tokens #080808/#FAC51C, Outfit+JetBrains, sidebar, cards) → Tasks 1,5,6,7 (portado de imasd-gestor). ✅
- Token passthrough (Bearer JWT en cada llamada) → Task 2 (apiFetch). ✅
- Config por entorno (Vercel-ready) → Task 1 (.env). ✅
- Verificación real de la app → Task 9 (Playwright smoke). ✅

**Placeholder scan:** sin TBD/TODO en código. Los pasos de "portar visual de imasd-gestor" dan la ruta fuente exacta + la sustitución de datos concreta (qué hooks reemplazan qué llamadas Supabase) — es una instrucción completa de port, no un placeholder; el código de infra/API/auth/hooks/lógica de columnas y `resolveMove` está completo. ✅

**Type consistency:** `Project`/`Task`/`TaskStatus` (Task 2) usados en api/queries/board/dashboard. `apiFetch`/`listProjects`/`createProject`/`listTasks`/`createTask`/`updateTask`/`moveTask` (Task 2) consumidos por los hooks (Task 4). `useProjects`/`useCreateProject`/`useTasks`/`useCreateTask`/`useMoveTask` (Task 4) usados en dashboard (6) y board (7,8). `login`/`saveToken`/`getToken`/`clearToken` (Task 3) usados en login + guard (5). `COLUMNS`/`resolveMove` (Tasks 7,8) coherentes. `data-testid="column-<status>"` consistente entre Board/Column y los tests (7,8) y Playwright (9). ✅
