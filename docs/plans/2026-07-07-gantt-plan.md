# Gantt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draggable, day-scale Gantt view as a third alternative (beside Board and List) on the project page, backed by a new `start_date` field on tasks.

**Architecture:** Backend gains a `start_date` string column mirroring `due_date` (Task 1). The frontend gets two pure, unit-tested modules — `lib/dates.ts` (TZ-safe date math) and `lib/gantt.ts` (bar geometry + drag math) — consumed by a new `GanttView` component that renders a day axis and one draggable bar per top-level task, PATCHing `start_date`/`due_date` on drop via the existing `useUpdateTask` mutation. `ProjectView` gains a third toggle.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + pytest (backend, in Docker); Next.js 14 App Router + React 18 + TypeScript + @tanstack/react-query + vitest/@testing-library (frontend, on host).

## Global Constraints

- `start_date` mirrors `due_date` exactly: `Mapped[str | None]`, `String` nullable, format `YYYY-MM-DD`. Existing rows stay `NULL`. `""` clears the value; `None` leaves it untouched (same convention as `due_date`/`description`).
- Ownership/access failures return **404, never 403** (existing `get_accessible_*` pattern). Per-user data isolation is mandatory.
- **No new date library.** `lib/dates.ts` is hand-rolled with UTC arithmetic to avoid DST/timezone off-by-one.
- Frontend styling uses existing dark tokens only (`var(--bg-*)`, `var(--text)`, `var(--border)`, `var(--accent)`). No new CSS tokens.
- Gantt shows **top-level tasks only** (`list_tasks` already filters `parent_id IS NULL`).
- Drag snaps to whole days; clamp `inicio ≤ fin`. Movement below `DRAG_CLICK_THRESHOLD_PX` (4px) is a click that opens `TaskDetailPanel`.
- Implementers must NOT use `git add -A` — the frontend repo ignores `.superpowers/`. Stage explicit paths.
- Backend tests run in Docker: `docker compose run --rm api pytest …` from `idled-backend`. Frontend tests run on host: `npx vitest run …` and `npx tsc --noEmit` from `idled-frontend`.

---

### Task 1: Backend `start_date` field (repo: idled-backend)

**Files:**
- Modify: `app/gestor/models.py` (Task model)
- Create: `migrations/versions/b2d4f6a8c0e2_task_start_date.py`
- Modify: `app/gestor/service.py` (`create_task`, `update_task`)
- Modify: `app/api/projects.py` (`TaskBody`, `_task_dict`, `crear_tarea`)
- Modify: `app/api/tasks.py` (`TaskUpdateBody`, `_task_dict`, `actualizar`)
- Test: `tests/test_gestor_tasks_service.py` (append)

**Interfaces:**
- Consumes: existing `create_task(...)` / `update_task(...)` signatures.
- Produces: `Task.start_date: str | None`; both `_task_dict` return dicts include `"start_date"`; `create_task`/`update_task` accept `start_date: str | None`. The frontend `Task` type (Task 2) relies on the API returning `start_date`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_gestor_tasks_service.py` (and add `import uuid` at the top of the file, below the existing imports):

```python
@pytest.mark.asyncio
async def test_start_date_round_trip(session):
    p = await create_project(session, "ext-1", "P")
    t = await create_task(session, p.id, "ext-1", title="a", start_date="2026-07-10")
    assert t.start_date == "2026-07-10"
    upd = await update_task(session, t.id, "ext-1", start_date="2026-07-12")
    assert upd.start_date == "2026-07-12"
    # clearing sends "" (not None); None is ignored by update_task
    cleared = await update_task(session, t.id, "ext-1", start_date="")
    assert cleared.start_date == ""
    untouched = await update_task(session, t.id, "ext-1", start_date=None)
    assert untouched.start_date == ""


def test_task_dict_includes_start_date():
    from types import SimpleNamespace
    from app.api.projects import _task_dict as project_task_dict
    from app.api.tasks import _task_dict as task_task_dict
    t = SimpleNamespace(
        id=uuid.uuid4(), title="a", task_type="PPTO", status="open", assignee=None,
        due_date="2026-07-11", start_date="2026-07-01", position=0, description=None, parent_id=None,
    )
    for fn in (project_task_dict, task_task_dict):
        d = fn(t)
        assert d["start_date"] == "2026-07-01"
        assert d["due_date"] == "2026-07-11"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm api pytest tests/test_gestor_tasks_service.py::test_start_date_round_trip tests/test_gestor_tasks_service.py::test_task_dict_includes_start_date -v`
Expected: FAIL — `create_task() got an unexpected keyword argument 'start_date'` and `KeyError: 'start_date'`.

- [ ] **Step 3: Add the model column**

In `app/gestor/models.py`, inside `class Task`, add `start_date` immediately after the `due_date` line:

```python
    due_date: Mapped[str | None] = mapped_column(String, nullable=True)
    start_date: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 4: Create the Alembic migration**

Create `migrations/versions/b2d4f6a8c0e2_task_start_date.py`:

```python
"""task start_date

Revision ID: b2d4f6a8c0e2
Revises: a1b3c5d7e9f2
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2d4f6a8c0e2'
down_revision: Union[str, Sequence[str], None] = 'a1b3c5d7e9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tasks', sa.Column('start_date', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'start_date')
```

- [ ] **Step 5: Thread `start_date` through the service**

In `app/gestor/service.py`, `create_task`: add the kwarg and pass it to the `Task(...)` constructor.

Change the signature line:
```python
    assignee: str | None = None, due_date: str | None = None,
```
to:
```python
    assignee: str | None = None, due_date: str | None = None, start_date: str | None = None,
```
And in the `Task(...)` constructor add `start_date=start_date,`:
```python
    task = Task(
        project_id=project_id, title=title, task_type=task_type, status=status,
        assignee=assignee, due_date=due_date, start_date=start_date, position=position,
    )
```

In `update_task`, add the kwarg and the assignment. Change the signature line:
```python
    description: str | None = None, status: str | None = None,
```
to:
```python
    description: str | None = None, status: str | None = None, start_date: str | None = None,
```
And add, right after the `due_date` block (`if due_date is not None: task.due_date = due_date`):
```python
    if start_date is not None:
        task.start_date = start_date
```

- [ ] **Step 6: Thread `start_date` through the API layer**

In `app/api/projects.py`:
- In `class TaskBody`, add after `due_date`: `start_date: str | None = None`.
- In `_task_dict`, add `"start_date": t.start_date,` to the returned dict.
- In `crear_tarea`, pass `start_date=body.start_date,` to `create_task(...)` (after `due_date=body.due_date,`).

In `app/api/tasks.py`:
- In `class TaskUpdateBody`, add after `status`: `start_date: str | None = None`.
- In `_task_dict`, add `"start_date": t.start_date,` to the returned dict.
- In `actualizar`, pass `start_date=body.start_date,` to `update_task(...)` (after `status=body.status`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose run --rm api pytest tests/test_gestor_tasks_service.py -v`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 8: Commit**

```bash
git add app/gestor/models.py migrations/versions/b2d4f6a8c0e2_task_start_date.py app/gestor/service.py app/api/projects.py app/api/tasks.py tests/test_gestor_tasks_service.py
git commit -m "feat: add task start_date field for Gantt"
```

---

### Task 2: Frontend `start_date` wiring — types, client, panel (repo: idled-frontend)

**Files:**
- Modify: `lib/types.ts` (`Task`)
- Modify: `lib/api.ts` (`createTask`, `updateTask` param types)
- Modify: `lib/queries.ts` (`useUpdateTask` patch type)
- Modify: `components/kanban/TaskDetailPanel.tsx` (add "inicio" date input)

**Interfaces:**
- Consumes: backend now returns `start_date` (Task 1).
- Produces: `Task.start_date: string | null`; `updateTask`/`useUpdateTask` `patch` accepts `start_date?: string | null`. `lib/gantt.ts` (Task 4) reads `Task.start_date`; `GanttView` (Task 5) calls `useUpdateTask` with a `start_date`/`due_date` patch.

This task is type plumbing plus one mirrored input; it is verified by `npx tsc --noEmit` and the existing suite staying green (no new unit test — the new field is exercised end-to-end by Task 5's tests).

- [ ] **Step 1: Add `start_date` to the `Task` type**

In `lib/types.ts`, in `interface Task`, add after the `due_date` line:
```typescript
  due_date: string | null
  start_date: string | null
```

- [ ] **Step 2: Add `start_date` to the API client param types**

In `lib/api.ts`:
- `createTask` `input` type — add `start_date?: string | null` inside the object:
```typescript
  input: { title: string; task_type?: string; status?: TaskStatus; assignee?: string | null; due_date?: string | null; start_date?: string | null },
```
- `updateTask` `patch` type — add `start_date?: string | null`:
```typescript
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; start_date?: string | null; description?: string; status?: TaskStatus },
```

- [ ] **Step 3: Add `start_date` to `useUpdateTask`'s patch type**

In `lib/queries.ts`, in `useUpdateTask`, extend the `patch` type in the `mutationFn` argument:
```typescript
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; start_date?: string | null; description?: string; status?: TaskStatus }
```

- [ ] **Step 4: Add the "inicio" input to TaskDetailPanel**

In `components/kanban/TaskDetailPanel.tsx`, inside `TaskFields`:

Add a state line after the `dueDate` state (line ~36):
```typescript
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [startDate, setStartDate] = useState(task.start_date ?? '')
```

Add the input block immediately **before** the existing "Fecha" (`td-due`) label/input so start comes before end:
```tsx
      <label htmlFor="td-start" style={labelStyle}>Inicio</label>
      <input id="td-start" aria-label="inicio" type="date" value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        onBlur={() => patchIfChanged('start_date', startDate, task.start_date ?? '')} style={fieldStyle} />

      <label htmlFor="td-due" style={labelStyle}>Fecha</label>
```
(The `<label htmlFor="td-due" style={labelStyle}>Fecha</label>` line already exists — do not duplicate it; the snippet ends by showing where the new block joins the existing one.)

- [ ] **Step 5: Type-check and run the existing suite**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by these files (pre-existing errors in unrelated test files may remain — confirm none reference `lib/types.ts`, `lib/api.ts`, `lib/queries.ts`, or `TaskDetailPanel.tsx`).

Run: `npx vitest run`
Expected: PASS (existing suite unaffected).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/api.ts lib/queries.ts components/kanban/TaskDetailPanel.tsx
git commit -m "feat: wire start_date into task type, client, and detail panel"
```

---

### Task 3: `lib/dates.ts` — TZ-safe date helpers (repo: idled-frontend)

**Files:**
- Create: `lib/dates.ts`
- Test: `tests/dates.test.ts`

**Interfaces:**
- Produces: `parseISO(iso: string): number`, `toISO(ms: number): string`, `addDays(iso: string, n: number): string`, `diffDays(a: string, b: string): number`, `todayISO(): string`, `dayLabel(iso: string): string`. Consumed by `lib/gantt.ts` (Task 4) and `GanttView` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `tests/dates.test.ts`:
```typescript
import { it, expect } from 'vitest'
import { parseISO, toISO, addDays, diffDays, todayISO, dayLabel } from '@/lib/dates'

it('round-trips ISO through ms', () => {
  expect(toISO(parseISO('2026-07-07'))).toBe('2026-07-07')
})

it('adds days across a month boundary', () => {
  expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})

it('diffs days (b - a), signed', () => {
  expect(diffDays('2026-07-07', '2026-07-10')).toBe(3)
  expect(diffDays('2026-07-10', '2026-07-07')).toBe(-3)
  expect(diffDays('2026-07-07', '2026-07-07')).toBe(0)
})

it('formats a short DD/MM day label', () => {
  expect(dayLabel('2026-07-09')).toBe('09/07')
})

it('todayISO returns a YYYY-MM-DD string', () => {
  expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dates.test.ts`
Expected: FAIL — cannot resolve `@/lib/dates`.

- [ ] **Step 3: Implement `lib/dates.ts`**

Create `lib/dates.ts`:
```typescript
// All calendar dates are 'YYYY-MM-DD' strings. Arithmetic goes through UTC
// midnight so day math never drifts across DST or timezone boundaries.

const DAY_MS = 86_400_000

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function toISO(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, n: number): string {
  return toISO(parseISO(iso) + n * DAY_MS)
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS)
}

export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts tests/dates.test.ts
git commit -m "feat: add TZ-safe date helpers for Gantt"
```

---

### Task 4: `lib/gantt.ts` — bar geometry + drag math (repo: idled-frontend)

**Files:**
- Create: `lib/gantt.ts`
- Test: `tests/gantt.test.ts`

**Interfaces:**
- Consumes: `lib/dates.ts` (`diffDays`, `addDays`); `Task` type (`start_date`, `due_date`).
- Produces:
  - `PX_PER_DAY = 28`, `WINDOW_PADDING_DAYS = 1`, `DRAG_CLICK_THRESHOLD_PX = 4` (constants).
  - `type Span = { startISO: string; endISO: string }`, `type DragMode = 'move' | 'resize-start' | 'resize-end'`, `type Window = { startISO: string; endISO: string; days: number }`.
  - `barSpan(task: Pick<Task, 'start_date' | 'due_date'>): Span | null`.
  - `computeWindow(spans: Span[]): Window` (spans must be non-empty).
  - `barGeometry(span: Span, win: Window, pxPerDay?: number): { leftPx: number; widthPx: number }`.
  - `applyDrag(span: Span, mode: DragMode, dayDelta: number): { start_date: string; due_date: string }`.
  Consumed by `GanttView` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `tests/gantt.test.ts`:
```typescript
import { it, expect } from 'vitest'
import { barSpan, computeWindow, barGeometry, applyDrag, PX_PER_DAY } from '@/lib/gantt'

const task = (start_date: string | null, due_date: string | null) =>
  ({ start_date, due_date })

it('barSpan uses both dates when present', () => {
  expect(barSpan(task('2026-07-05', '2026-07-09'))).toEqual({ startISO: '2026-07-05', endISO: '2026-07-09' })
})

it('barSpan falls back to a single day when one date is missing', () => {
  expect(barSpan(task(null, '2026-07-09'))).toEqual({ startISO: '2026-07-09', endISO: '2026-07-09' })
  expect(barSpan(task('2026-07-05', null))).toEqual({ startISO: '2026-07-05', endISO: '2026-07-05' })
})

it('barSpan collapses to one day when start is after due', () => {
  expect(barSpan(task('2026-07-20', '2026-07-09'))).toEqual({ startISO: '2026-07-09', endISO: '2026-07-09' })
})

it('barSpan returns null when both dates are missing', () => {
  expect(barSpan(task(null, null))).toBeNull()
  expect(barSpan(task('', ''))).toBeNull()
})

it('computeWindow spans min→max with one day of padding each side', () => {
  const win = computeWindow([
    { startISO: '2026-07-05', endISO: '2026-07-07' },
    { startISO: '2026-07-06', endISO: '2026-07-10' },
  ])
  expect(win.startISO).toBe('2026-07-04')
  expect(win.endISO).toBe('2026-07-11')
  expect(win.days).toBe(8)
})

it('barGeometry offsets and sizes a bar within the window', () => {
  const win = { startISO: '2026-07-04', endISO: '2026-07-11', days: 8 }
  const geo = barGeometry({ startISO: '2026-07-05', endISO: '2026-07-07' }, win, PX_PER_DAY)
  expect(geo.leftPx).toBe(1 * PX_PER_DAY)   // one day after window start
  expect(geo.widthPx).toBe(3 * PX_PER_DAY)  // inclusive: 5th,6th,7th
})

it('applyDrag move shifts both ends', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'move', 2))
    .toEqual({ start_date: '2026-07-07', due_date: '2026-07-11' })
})

it('applyDrag resize-start moves start, clamped not to pass end', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-start', 2))
    .toEqual({ start_date: '2026-07-07', due_date: '2026-07-09' })
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-start', 10))
    .toEqual({ start_date: '2026-07-09', due_date: '2026-07-09' })
})

it('applyDrag resize-end moves end, clamped not to pass start', () => {
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-end', 2))
    .toEqual({ start_date: '2026-07-05', due_date: '2026-07-11' })
  expect(applyDrag({ startISO: '2026-07-05', endISO: '2026-07-09' }, 'resize-end', -10))
    .toEqual({ start_date: '2026-07-05', due_date: '2026-07-05' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gantt.test.ts`
Expected: FAIL — cannot resolve `@/lib/gantt`.

- [ ] **Step 3: Implement `lib/gantt.ts`**

Create `lib/gantt.ts`:
```typescript
import type { Task } from './types'
import { diffDays, addDays } from './dates'

export const PX_PER_DAY = 28
export const WINDOW_PADDING_DAYS = 1
export const DRAG_CLICK_THRESHOLD_PX = 4

export type Span = { startISO: string; endISO: string }
export type DragMode = 'move' | 'resize-start' | 'resize-end'
export type Window = { startISO: string; endISO: string; days: number }

// Bar span for a task, applying the single-day fallback. Returns null when the
// task has no dates at all (it goes to the "unscheduled" section instead).
export function barSpan(task: Pick<Task, 'start_date' | 'due_date'>): Span | null {
  const s = task.start_date || null
  const e = task.due_date || null
  if (s && e) {
    return diffDays(s, e) < 0 ? { startISO: e, endISO: e } : { startISO: s, endISO: e }
  }
  if (s) return { startISO: s, endISO: s }
  if (e) return { startISO: e, endISO: e }
  return null
}

// Window covering all bars, padded by WINDOW_PADDING_DAYS on each side.
// `spans` must be non-empty.
export function computeWindow(spans: Span[]): Window {
  let minISO = spans[0].startISO
  let maxISO = spans[0].endISO
  for (const sp of spans) {
    if (diffDays(sp.startISO, minISO) > 0) minISO = sp.startISO
    if (diffDays(maxISO, sp.endISO) > 0) maxISO = sp.endISO
  }
  const startISO = addDays(minISO, -WINDOW_PADDING_DAYS)
  const endISO = addDays(maxISO, WINDOW_PADDING_DAYS)
  return { startISO, endISO, days: diffDays(startISO, endISO) + 1 }
}

export function barGeometry(span: Span, win: Window, pxPerDay = PX_PER_DAY): { leftPx: number; widthPx: number } {
  const leftPx = diffDays(win.startISO, span.startISO) * pxPerDay
  const widthPx = (diffDays(span.startISO, span.endISO) + 1) * pxPerDay
  return { leftPx, widthPx }
}

// New {start_date, due_date} after dragging `dayDelta` days. move shifts both
// ends; resize-* moves one end, clamped so start never passes end (and vice versa).
export function applyDrag(span: Span, mode: DragMode, dayDelta: number): { start_date: string; due_date: string } {
  if (mode === 'move') {
    return { start_date: addDays(span.startISO, dayDelta), due_date: addDays(span.endISO, dayDelta) }
  }
  if (mode === 'resize-start') {
    let newStart = addDays(span.startISO, dayDelta)
    if (diffDays(newStart, span.endISO) < 0) newStart = span.endISO
    return { start_date: newStart, due_date: span.endISO }
  }
  let newEnd = addDays(span.endISO, dayDelta)
  if (diffDays(span.startISO, newEnd) < 0) newEnd = span.startISO
  return { start_date: span.startISO, due_date: newEnd }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gantt.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/gantt.ts tests/gantt.test.ts
git commit -m "feat: add Gantt bar geometry and drag math"
```

---

### Task 5: `GanttView` component (repo: idled-frontend)

**Files:**
- Create: `components/kanban/GanttView.tsx`
- Test: `tests/gantt-view.test.tsx`

**Interfaces:**
- Consumes: `useTasks`, `useMembers`, `useUpdateTask` (from `@/lib/queries`); `barSpan`, `computeWindow`, `barGeometry`, `applyDrag`, `PX_PER_DAY`, `DRAG_CLICK_THRESHOLD_PX`, `Span`, `DragMode` (from `@/lib/gantt`); `addDays`, `diffDays`, `todayISO`, `dayLabel` (from `@/lib/dates`); `TaskDetailPanel`.
- Produces: `default export function GanttView({ projectId }: { projectId: string })`. Consumed by `ProjectView` (Task 6). Test ids: `gantt-axis`, `gantt-row`, `gantt-bar` (with `data-task-id`), `gantt-resize-start`, `gantt-resize-end`, `gantt-today-line`, `gantt-unscheduled`, `gantt-unscheduled-row`.

- [ ] **Step 1: Write the failing test**

Create `tests/gantt-view.test.tsx`:
```tsx
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as queries from '@/lib/queries'
import { PX_PER_DAY } from '@/lib/gantt'
import type { Task } from '@/lib/types'

vi.mock('@/components/kanban/TaskDetailPanel', () => ({
  default: ({ taskId }: { taskId: string }) => <div data-testid="detail-panel">{taskId}</div>,
}))

beforeEach(() => vi.restoreAllMocks())

const task = (over: Partial<Task>): Task => ({
  id: 'x', title: 't', task_type: 'PPTO', status: 'open', assignee: null,
  due_date: null, start_date: null, position: 0, description: null, parent_id: null, ...over,
})

const mutate = vi.fn()

function stub(tasks: Task[]) {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: tasks, isLoading: false } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
  vi.spyOn(queries, 'useUpdateTask').mockReturnValue({ mutate } as never)
}

it('renders a bar per dated task and the day axis', async () => {
  stub([
    task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' }),
    task({ id: 'b', title: 'B', due_date: '2026-07-06' }), // single-day fallback
  ])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  expect(screen.getByTestId('gantt-axis')).toBeInTheDocument()
  expect(screen.getAllByTestId('gantt-bar')).toHaveLength(2)
})

it('lists tasks with no dates under "sin programar"', async () => {
  stub([task({ id: 'c', title: 'C' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  expect(screen.getByTestId('gantt-unscheduled')).toBeInTheDocument()
  expect(screen.getByTestId('gantt-unscheduled-row')).toHaveTextContent('C')
  expect(screen.queryByTestId('gantt-bar')).not.toBeInTheDocument()
})

it('opens the detail panel when a bar is clicked (no drag)', async () => {
  stub([task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  const bar = screen.getByTestId('gantt-bar')
  fireEvent.pointerDown(bar, { clientX: 100 })
  fireEvent.pointerUp(window, { clientX: 100 })
  expect(screen.getByTestId('detail-panel')).toHaveTextContent('a')
  expect(mutate).not.toHaveBeenCalled()
})

it('PATCHes new dates after dragging a bar', async () => {
  stub([task({ id: 'a', title: 'A', start_date: '2026-07-05', due_date: '2026-07-08' })])
  const { default: GanttView } = await import('@/components/kanban/GanttView')
  render(<GanttView projectId="p1" />)
  const bar = screen.getByTestId('gantt-bar')
  fireEvent.pointerDown(bar, { clientX: 100 })
  fireEvent.pointerMove(window, { clientX: 100 + 2 * PX_PER_DAY }) // +2 days
  fireEvent.pointerUp(window, { clientX: 100 + 2 * PX_PER_DAY })
  expect(mutate).toHaveBeenCalledWith({ taskId: 'a', patch: { start_date: '2026-07-07', due_date: '2026-07-10' } })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gantt-view.test.tsx`
Expected: FAIL — cannot resolve `@/components/kanban/GanttView`.

- [ ] **Step 3: Implement `components/kanban/GanttView.tsx`**

Create `components/kanban/GanttView.tsx`:
```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useTasks, useMembers, useUpdateTask } from '@/lib/queries'
import type { Task, TaskStatus } from '@/lib/types'
import {
  barSpan, computeWindow, barGeometry, applyDrag,
  PX_PER_DAY, DRAG_CLICK_THRESHOLD_PX, type Span, type DragMode,
} from '@/lib/gantt'
import { addDays, diffDays, todayISO, dayLabel } from '@/lib/dates'
import TaskDetailPanel from './TaskDetailPanel'

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: '#6b7280', progress: '#3b82f6', review: '#a855f7', done: '#22c55e',
}
const ROW_H = 34
const LABEL_W = 180

type Drag = { taskId: string; span: Span; mode: DragMode; startX: number; dayDelta: number; moved: boolean }

export default function GanttView({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useTasks(projectId)
  const { data: members } = useMembers(projectId)
  const update = useUpdateTask(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      setDrag({ ...d, dayDelta: Math.round(dx / PX_PER_DAY), moved: d.moved || Math.abs(dx) >= DRAG_CLICK_THRESHOLD_PX })
    }
    function onUp() {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      if (!d.moved) { setSelectedId(d.taskId); return }
      if (d.dayDelta !== 0) update.mutate({ taskId: d.taskId, patch: applyDrag(d.span, d.mode, d.dayDelta) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, update])

  if (isLoading) return <p style={{ padding: 24, color: 'var(--text)' }}>Cargando…</p>

  const all = tasks ?? []
  if (all.length === 0) return <p style={{ padding: 24, color: '#888' }}>No hay tareas todavía.</p>

  const memberNames: Record<string, string> = {}
  for (const m of members ?? []) memberNames[m.external_id] = m.name ?? m.external_id

  const dated: { task: Task; span: Span }[] = []
  const unscheduled: Task[] = []
  for (const t of all) {
    const span = barSpan(t)
    if (span) dated.push({ task: t, span })
    else unscheduled.push(t)
  }

  const win = dated.length ? computeWindow(dated.map((d) => d.span)) : null
  const today = todayISO()
  const todayInWindow = !!win && diffDays(win.startISO, today) >= 0 && diffDays(today, win.endISO) >= 0
  const gridW = win ? win.days * PX_PER_DAY : 0

  function startDrag(task: Task, span: Span, mode: DragMode, e: React.PointerEvent) {
    e.preventDefault()
    setDrag({ taskId: task.id, span, mode, startX: e.clientX, dayDelta: 0, moved: false })
  }

  return (
    <div style={{ padding: 24, overflowX: 'auto', color: 'var(--text)' }}>
      {win && (
        <div style={{ minWidth: LABEL_W + gridW }}>
          <div data-testid="gantt-axis" style={{ display: 'flex', marginLeft: LABEL_W }}>
            {Array.from({ length: win.days }).map((_, i) => {
              const iso = addDays(win.startISO, i)
              return (
                <div key={iso} style={{ width: PX_PER_DAY, fontSize: 9, color: '#888', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                  {dayLabel(iso)}
                </div>
              )
            })}
          </div>
          <div style={{ position: 'relative' }}>
            {todayInWindow && (
              <div data-testid="gantt-today-line" style={{
                position: 'absolute', top: 0, bottom: 0, width: 2, opacity: 0.6, background: 'var(--accent)',
                left: LABEL_W + diffDays(win.startISO, today) * PX_PER_DAY,
              }} />
            )}
            {dated.map(({ task, span }) => {
              const active = drag && drag.taskId === task.id && drag.moved ? drag : null
              const shown = active ? (() => {
                const p = applyDrag(span, active.mode, active.dayDelta)
                return { startISO: p.start_date, endISO: p.due_date }
              })() : span
              const geo = barGeometry(shown, win, PX_PER_DAY)
              return (
                <div key={task.id} data-testid="gantt-row" style={{ display: 'flex', alignItems: 'center', height: ROW_H }}>
                  <div style={{ width: LABEL_W, fontSize: 12, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title}
                  </div>
                  <div style={{ position: 'relative', height: ROW_H, flex: 1 }}>
                    <div data-testid="gantt-bar" data-task-id={task.id}
                      onPointerDown={(e) => startDrag(task, span, 'move', e)}
                      style={{
                        position: 'absolute', top: 6, height: ROW_H - 12, left: geo.leftPx, width: geo.widthPx,
                        background: STATUS_COLORS[task.status], borderRadius: 5, cursor: 'grab',
                        display: 'flex', alignItems: 'center', color: '#fff', fontSize: 10, userSelect: 'none',
                      }}>
                      <span data-testid="gantt-resize-start"
                        onPointerDown={(e) => { e.stopPropagation(); startDrag(task, span, 'resize-start', e) }}
                        style={{ width: 8, height: '100%', cursor: 'ew-resize', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', paddingLeft: 2 }}>
                        {task.assignee ? (memberNames[task.assignee] ?? task.assignee) : ''}
                      </span>
                      <span data-testid="gantt-resize-end"
                        onPointerDown={(e) => { e.stopPropagation(); startDrag(task, span, 'resize-end', e) }}
                        style={{ width: 8, height: '100%', cursor: 'ew-resize', flexShrink: 0 }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div data-testid="gantt-unscheduled" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Sin programar · {unscheduled.length}</div>
          {unscheduled.map((t) => (
            <button key={t.id} data-testid="gantt-unscheduled-row" onClick={() => setSelectedId(t.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 8, marginBottom: 6,
                background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
              }}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {selectedId && (
        <TaskDetailPanel key={selectedId} taskId={selectedId} projectId={projectId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gantt-view.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/kanban/GanttView.tsx tests/gantt-view.test.tsx
git commit -m "feat: add draggable Gantt view component"
```

---

### Task 6: `ProjectView` Gantt toggle (repo: idled-frontend)

**Files:**
- Modify: `components/kanban/ProjectView.tsx`
- Test: `tests/project-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `GanttView` (Task 5).
- Produces: `View` union `'board' | 'list' | 'gantt'`; toggle button `data-testid="view-toggle-gantt"`; `localStorage['idled_project_view']` accepts `'gantt'`.

- [ ] **Step 1: Extend the failing test**

In `tests/project-view.test.tsx`, add the GanttView mock beside the existing mocks:
```tsx
vi.mock('@/components/kanban/GanttView', () => ({ default: () => <div data-testid="gantt-view" /> }))
```
And append two tests:
```tsx
it('switches to the gantt view and persists the choice', async () => {
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  fireEvent.click(screen.getByTestId('view-toggle-gantt'))
  expect(screen.getByTestId('gantt-view')).toBeInTheDocument()
  expect(screen.queryByTestId('board-view')).not.toBeInTheDocument()
  expect(window.localStorage.getItem('idled_project_view')).toBe('gantt')
})

it('starts in the gantt view when localStorage says so', async () => {
  window.localStorage.setItem('idled_project_view', 'gantt')
  const { default: ProjectView } = await import('@/components/kanban/ProjectView')
  render(<ProjectView projectId="p1" />)
  expect(screen.getByTestId('gantt-view')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project-view.test.tsx`
Expected: FAIL — no `view-toggle-gantt` button; gantt view never renders.

- [ ] **Step 3: Implement the toggle**

Replace `components/kanban/ProjectView.tsx` with:
```tsx
'use client'
import { useState } from 'react'
import Board from './Board'
import TaskListView from './TaskListView'
import GanttView from './GanttView'

const VIEW_KEY = 'idled_project_view'
type View = 'board' | 'list' | 'gantt'

function initialView(): View {
  if (typeof window === 'undefined') return 'board'
  const v = window.localStorage.getItem(VIEW_KEY)
  return v === 'list' || v === 'gantt' ? v : 'board'
}

const btn = (active: boolean) => ({
  padding: '6px 14px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
  background: active ? 'var(--accent)' : 'var(--bg-4)', color: active ? '#000' : 'var(--text)',
} as const)

export default function ProjectView({ projectId }: { projectId: string }) {
  const [view, setView] = useState<View>(initialView)

  function choose(next: View) {
    setView(next)
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', padding: '8px 24px 0' }}>
        <button data-testid="view-toggle-board" aria-pressed={view === 'board'} onClick={() => choose('board')}
          style={{ ...btn(view === 'board'), borderRadius: '8px 0 0 8px' }}>Tablero</button>
        <button data-testid="view-toggle-list" aria-pressed={view === 'list'} onClick={() => choose('list')}
          style={{ ...btn(view === 'list'), borderLeft: 'none' }}>Lista</button>
        <button data-testid="view-toggle-gantt" aria-pressed={view === 'gantt'} onClick={() => choose('gantt')}
          style={{ ...btn(view === 'gantt'), borderRadius: '0 8px 8px 0', borderLeft: 'none' }}>Gantt</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {view === 'board' ? <Board projectId={projectId} />
          : view === 'list' ? <TaskListView projectId={projectId} />
          : <GanttView projectId={projectId} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/project-view.test.tsx`
Expected: PASS (5 tests: 3 existing + 2 new).

- [ ] **Step 5: Run the full frontend suite and type-check**

Run: `npx vitest run`
Expected: PASS (whole suite).
Run: `npx tsc --noEmit`
Expected: no new errors from the Gantt files.

- [ ] **Step 6: Commit**

```bash
git add components/kanban/ProjectView.tsx tests/project-view.test.tsx
git commit -m "feat: add Gantt toggle to project view"
```

---

## Notes for the executor

- **Two repos.** Task 1 lands in `idled-backend`; Tasks 2–6 in `idled-frontend`. Run each repo's tests in its own working dir.
- **Task order matters:** Task 2 (types) must precede Tasks 4–6 (they read `Task.start_date`); Task 3 (dates) precedes Task 4 (gantt) precedes Task 5 (view) precedes Task 6 (toggle). Task 1 is independent but should land first so the field exists end-to-end.
- **Status→bar color** is a small local `STATUS_COLORS` map in `GanttView` (there is no existing status-color helper in the codebase to reuse).
