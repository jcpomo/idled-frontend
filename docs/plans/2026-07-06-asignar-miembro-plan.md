# Asignar tareas a un miembro real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The task "asignado" field becomes a select of the project's members (stored as the member's external_id), the backend rejects a non-member assignee, and the board card shows the member's name.

**Architecture:** `assignee` stays a `str` (external_id of a member; `""` = unassigned) — no schema change. The backend validates a non-empty assignee is a member (owner or member) via `is_project_member`, raising `ValueError` → 422. The panel's assignee input becomes a `<select>` fed by `useMembers`; the board loads members and threads an `external_id→name` map to the card for display.

**Tech Stack:** Backend: FastAPI, SQLAlchemy 2 async, pytest (Docker). Frontend: Next.js 14.2, React 18, TypeScript, @tanstack/react-query, vitest + @testing-library/react (host).

## Global Constraints

- **Two repos.** Task 1 in `/Users/pomo/Documents/App/Bruno/idled-backend`. Tasks 2–3 in `/Users/pomo/Documents/App/Bruno/idled-frontend`. Commit where the files live.
- **No schema change / no migration** — `assignee` stays `str | None`.
- **`assignee` stores a member external_id; `""` = unassigned** (allowed; `update_task` applies it because `"" is not None`).
- **Backend validation:** a non-empty `assignee` must be a member (owner or member) of the task's project, else `ValueError` → **422** at the endpoint. `""` and an absent assignee are allowed.
- **Display name resolves on the frontend** via `useMembers`; legacy/non-member assignee falls back to the raw value (never lost).
- **Backend tests run in Docker:** `docker compose run --rm api pytest <path>`. **Frontend tests run on the HOST:** `npx vitest run <path>`.
- Dark tokens. TDD, YAGNI, pristine output. Commit only the files each task lists (never `git add -A`).

---

## File Structure

**Backend (`idled-backend`):**
- `app/gestor/service.py` — `is_project_member`; assignee validation in `create_task`/`update_task`.
- `app/api/tasks.py` — PATCH catches `ValueError` → 422.
- `app/api/projects.py` — create-task catches `ValueError` → 422.
- Tests: `tests/test_gestor_sharing.py`, `tests/test_projects_endpoint.py`.

**Frontend (`idled-frontend`):**
- `components/kanban/TaskDetailPanel.tsx` — assignee `<select>` (via `useMembers`).
- `components/kanban/Board.tsx` — `useMembers` → `memberNames` map, threaded down.
- `components/kanban/Column.tsx` — passes `memberNames` to the card.
- `components/kanban/TaskCard.tsx` — shows the resolved name.
- Tests: `tests/task-detail-panel.test.tsx`, `tests/kanban-open.test.tsx`, `tests/board.test.tsx`, `tests/kanban-interactions.test.tsx`.

---

### Task 1: Backend — validate assignee is a member

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-backend`

**Files:**
- Modify: `app/gestor/service.py`, `app/api/tasks.py`, `app/api/projects.py`
- Test: `tests/test_gestor_sharing.py`, `tests/test_projects_endpoint.py`

**Interfaces:**
- Consumes: `get_accessible_project`, `create_task`, `update_task`, `ProjectMember`, the `client`/`_token` in the endpoint tests.
- Produces: `is_project_member(session, project_id, external_id) -> bool`; `create_task`/`update_task` raise `ValueError` on a non-member assignee.

- [ ] **Step 1: Write the failing service test** — append to `tests/test_gestor_sharing.py`

(This file already has `create_project`, `create_task`, `update_task` imported and a `_member(session, project_id, ext)` helper.)

```python
@pytest.mark.asyncio
async def test_assignee_must_be_member(session):
    from app.gestor.service import is_project_member
    p = await create_project(session, "owner", "P")
    await _member(session, p.id, "ext-2")
    t = await create_task(session, p.id, "owner", title="A")
    # a member is a valid assignee
    assert (await update_task(session, t.id, "owner", assignee="ext-2")).assignee == "ext-2"
    # the owner is a valid assignee
    assert (await update_task(session, t.id, "owner", assignee="owner")).assignee == "owner"
    # a non-member raises
    with pytest.raises(ValueError):
        await update_task(session, t.id, "owner", assignee="stranger")
    # unassigning with "" is allowed
    assert (await update_task(session, t.id, "owner", assignee="")).assignee == ""
    # creating with a non-member assignee raises
    with pytest.raises(ValueError):
        await create_task(session, p.id, "owner", title="B", assignee="stranger")
    # the helper
    assert await is_project_member(session, p.id, "ext-2") is True
    assert await is_project_member(session, p.id, "stranger") is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_gestor_sharing.py::test_assignee_must_be_member -v`
Expected: FAIL — `is_project_member` missing; no validation raises.

- [ ] **Step 3: Add `is_project_member` + validation** — `app/gestor/service.py`

Add the helper (place it right after `get_accessible_task`):

```python
async def is_project_member(
    session: AsyncSession, project_id: uuid.UUID, external_id: str
) -> bool:
    return (await get_accessible_project(session, project_id, external_id)) is not None
```

In `create_task`, after the `project = await get_accessible_project(...)` / `if project is None: return None` block and BEFORE building the `Task`, add:

```python
    if assignee is not None and assignee != "" and not await is_project_member(session, project_id, assignee):
        raise ValueError("Asignado no es miembro")
```

In `update_task`, replace the existing assignee application:

```python
    if assignee is not None:
        task.assignee = assignee
```
with the validated version:

```python
    if assignee is not None:
        if assignee != "" and not await is_project_member(session, task.project_id, assignee):
            raise ValueError("Asignado no es miembro")
        task.assignee = assignee
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `docker compose run --rm api pytest tests/test_gestor_sharing.py -v`
Expected: PASS (existing + new).

- [ ] **Step 5: Write the failing endpoint test** — append to `tests/test_projects_endpoint.py`

(Reuse this file's `client` fixture and `_token`, which accepts `sub`.)

```python
@pytest.mark.asyncio
async def test_assignee_endpoint_validation(client):
    async with client as ac:
        h = {"Authorization": f"Bearer {_token(sub='owner')}"}
        pid = (await ac.post("/api/projects", json={"name": "P"}, headers=h)).json()["id"]
        await ac.post(f"/api/projects/{pid}/members", json={"external_id": "ext-2"}, headers=h)
        tid = (await ac.post(f"/api/projects/{pid}/tasks", json={"title": "A"}, headers=h)).json()["id"]
        # PATCH assignee to a member → 200
        rm = await ac.patch(f"/api/tasks/{tid}", json={"assignee": "ext-2"}, headers=h)
        assert rm.status_code == 200 and rm.json()["assignee"] == "ext-2"
        # PATCH assignee to a non-member → 422
        rb = await ac.patch(f"/api/tasks/{tid}", json={"assignee": "stranger"}, headers=h)
        assert rb.status_code == 422
        # unassign with "" → 200
        ru = await ac.patch(f"/api/tasks/{tid}", json={"assignee": ""}, headers=h)
        assert ru.status_code == 200 and ru.json()["assignee"] == ""
        # create a task with a non-member assignee → 422
        rc = await ac.post(f"/api/projects/{pid}/tasks", json={"title": "B", "assignee": "stranger"}, headers=h)
        assert rc.status_code == 422
```

- [ ] **Step 6: Run the endpoint test to verify it fails**

Run: `docker compose run --rm api pytest tests/test_projects_endpoint.py::test_assignee_endpoint_validation -v`
Expected: FAIL — the endpoints let the `ValueError` propagate (500) instead of returning 422.

- [ ] **Step 7: Catch `ValueError` → 422 in the endpoints**

In `app/api/tasks.py`, the PATCH `actualizar` handler — wrap the `update_task` call:

```python
    if body.status is not None and not is_valid_status(body.status):
        raise HTTPException(status_code=422, detail=f"Estado inválido: {body.status}")
    try:
        t = await update_task(session, task_id, user.external_id, title=body.title,
                              task_type=body.task_type, assignee=body.assignee,
                              due_date=body.due_date, description=body.description, status=body.status)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if t is None:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return _task_dict(t)
```

In `app/api/projects.py`, the `crear_tarea` handler — wrap the `create_task` call:

```python
    if not is_valid_status(body.status):
        raise HTTPException(status_code=422, detail=f"Estado inválido: {body.status}")
    try:
        t = await create_task(
            session, project_id, user.external_id, title=body.title, task_type=body.task_type,
            status=body.status, assignee=body.assignee, due_date=body.due_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if t is None:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return _task_dict(t)
```

- [ ] **Step 8: Run the endpoint test + full suite**

Run:
```bash
docker compose run --rm api pytest tests/test_projects_endpoint.py -v
docker compose run --rm api pytest -q
```
Expected: the new test passes; full suite green except the 4 pre-existing live/e2e `ConnectError` tests (unrelated).

- [ ] **Step 9: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-backend && git add app/gestor/service.py app/api/tasks.py app/api/projects.py tests/test_gestor_sharing.py tests/test_projects_endpoint.py
git commit -m "feat: validate task assignee is a project member (422 otherwise)"
```

---

### Task 2: Frontend — assignee select in the detail panel

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `components/kanban/TaskDetailPanel.tsx`, `tests/task-detail-panel.test.tsx`, `tests/kanban-open.test.tsx`

**Interfaces:**
- Consumes: `useMembers(projectId)` (returns `{data: Member[]}`, `Member { external_id; name: string | null; is_owner }`).
- Produces: the assignee field is a `<select aria-label="asignado">`.

- [ ] **Step 1: Update the panel test stub + write the failing assignee test** — `tests/task-detail-panel.test.tsx`

The `TaskFields` inner component will start calling `useMembers(projectId)`, so this file's `stub()` helper must mock it. Add this line inside `stub()` alongside the other `vi.spyOn(queries, …)` calls:

```tsx
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [
    { external_id: 'ext-2', name: 'Bea', is_owner: false },
    { external_id: 'owner', name: 'Dueño', is_owner: true },
  ] } as never)
```

Then append a new test. This file has a top-level task fixture (named `parent`, id `t1`) whose `assignee` is `'ED'` — a legacy value not among the members, which must still appear as the selected option. FIRST check the fixture's actual assignee value and use it verbatim in the two assertions below (replace `'ED'` if it differs):

```tsx
it('assignee is a member select with unassign, members, and a legacy fallback option', async () => {
  const { update } = stub({ current: parent })   // `parent` = the file's t1 fixture (assignee 'ED')
  const { default: Panel } = await import('@/components/kanban/TaskDetailPanel')
  render(<Panel taskId="t1" projectId="p1" onClose={() => {}} />)
  const select = screen.getByLabelText('asignado') as HTMLSelectElement
  const optionValues = Array.from(select.options).map((o) => o.value)
  // '' (Sin asignar) + the legacy 'ED' + the two members (member order = stub order: ext-2, owner)
  expect(optionValues).toEqual(['', 'ED', 'ext-2', 'owner'])
  expect(select.value).toBe('ED')             // current legacy assignee preserved & selected
  fireEvent.change(select, { target: { value: 'ext-2' } })
  expect(update).toHaveBeenCalledWith({ taskId: 't1', patch: { assignee: 'ext-2' }, parentId: undefined })
})
```
> If the fixture's assignee is not `'ED'`, substitute the real value in `optionValues` (the legacy slot) and in `select.value`. The `parent` fixture is top-level (`parent_id: null`) so `parentId` is `undefined` in the mutate call.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/task-detail-panel.test.tsx`
Expected: FAIL — the assignee field is still an `<input>`, not a select with options.

- [ ] **Step 3: Convert the assignee field to a member select** — `components/kanban/TaskDetailPanel.tsx`

Add `useMembers` to the queries import at the top of the file:

```tsx
import {
  useTask, useSubtasks, useCreateSubtask, useUpdateTask, useMoveTask, useDeleteTask, useTasks, useMembers,
} from '@/lib/queries'
```

In `TaskFields`, add the members query near the other hooks and REMOVE the now-unused `assignee` local state (the `const [assignee, setAssignee] = useState(task.assignee ?? '')` line):

```tsx
  const { data: members } = useMembers(projectId)
```

Replace the assignee `<label>` + `<input>` block with a `<select>`:

```tsx
      <label htmlFor="td-assignee" style={labelStyle}>Asignado</label>
      <select id="td-assignee" aria-label="asignado" value={task.assignee ?? ''}
        onChange={(e) => update.mutate({ taskId: task.id, patch: { assignee: e.target.value }, parentId })}
        style={fieldStyle}>
        <option value="">Sin asignar</option>
        {task.assignee && !(members ?? []).some((m) => m.external_id === task.assignee) && (
          <option value={task.assignee}>{task.assignee}</option>
        )}
        {(members ?? []).map((m) => (
          <option key={m.external_id} value={m.external_id}>{m.name ?? m.external_id}</option>
        ))}
      </select>
```
> The other text fields (título/descripción/tipo/fecha) keep their local-state + on-blur pattern unchanged. Only the assignee field changes to a select that mutates on change (like the estado select). `patchIfChanged` and the remaining local states stay.

- [ ] **Step 4: Mock useMembers where the panel is opened from the board** — `tests/kanban-open.test.tsx`

This test clicks a card to open the panel, which now renders `TaskFields` → `useMembers`. Add this line inside its `stub()` helper (alongside the existing `vi.spyOn(queries, …)` calls):

```tsx
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
```

- [ ] **Step 5: Run the panel + board-open tests, then the full suite + build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/task-detail-panel.test.tsx tests/kanban-open.test.tsx
npx vitest run
npm run build
```
Expected: targeted files pass; full suite passes; build compiles.

- [ ] **Step 6: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add components/kanban/TaskDetailPanel.tsx tests/task-detail-panel.test.tsx tests/kanban-open.test.tsx
git commit -m "feat: assign task to a project member via a select in the detail panel"
```

---

### Task 3: Frontend — show the assignee's name on the board card

**Repo:** `/Users/pomo/Documents/App/Bruno/idled-frontend`

**Files:**
- Modify: `components/kanban/Board.tsx`, `components/kanban/Column.tsx`, `components/kanban/TaskCard.tsx`, `tests/board.test.tsx`, `tests/kanban-interactions.test.tsx`

**Interfaces:**
- Consumes: `useMembers(projectId)`.
- Produces: `TaskCard` and `Column` gain a `memberNames: Record<string, string>` prop; `Board` builds it from `useMembers` and threads it down.

- [ ] **Step 1: Write the failing test** — append to `tests/board.test.tsx`

This file mocks `useTasks`/`useCreateTask`/`useMoveTask` and renders `Board`. `Board` will start calling `useMembers`, so its stub must mock it. First, add `useMembers` to the mocks (inside the setup/stub the file uses before rendering Board — mirror how it mocks the other hooks), returning a member whose id matches a task's assignee. Then assert the card shows the name.

```tsx
it('shows the assignee member name on the card, falling back to the raw id', async () => {
  vi.spyOn(queries, 'useTasks').mockReturnValue({ data: [
    { id: 't1', title: 'Con miembro', task_type: 'PPTO', status: 'open', assignee: 'ext-2', due_date: null, position: 0, description: null, parent_id: null },
    { id: 't2', title: 'Legacy', task_type: 'PPTO', status: 'open', assignee: 'ED', due_date: null, position: 1, description: null, parent_id: null },
  ], isLoading: false } as never)
  vi.spyOn(queries, 'useCreateTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMoveTask').mockReturnValue({ mutate: vi.fn() } as never)
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [
    { external_id: 'ext-2', name: 'Bea', is_owner: false },
  ] } as never)
  const { default: Board } = await import('@/components/kanban/Board')
  render(<Board projectId="p1" />)
  expect(screen.getByText('· Bea')).toBeInTheDocument()   // resolved name
  expect(screen.getByText('· ED')).toBeInTheDocument()    // legacy fallback to raw id
})
```
> Match the render/import style the existing tests in this file use. If this file already imports `* as queries` and `screen`/`render`, reuse them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/pomo/Documents/App/Bruno/idled-frontend && npx vitest run tests/board.test.tsx`
Expected: FAIL — the card shows `· ext-2` (raw id), not `· Bea`; and `useMembers` may be unmocked.

- [ ] **Step 3: Load members in `Board` and thread the name map** — `components/kanban/Board.tsx`

Add `useMembers` to the queries import:

```tsx
import { useTasks, useCreateTask, useMoveTask, useMembers } from '@/lib/queries'
```
In the `Board` component, add the members query near the other hooks (BEFORE the `if (isLoading) return` early return) and build the name map:

```tsx
  const { data: members } = useMembers(projectId)
```
After the early return, build the map (next to `byStatus`):

```tsx
  const memberNames: Record<string, string> = {}
  for (const m of members ?? []) memberNames[m.external_id] = m.name ?? m.external_id
```
Pass it to each `Column`:

```tsx
            <Column
              key={col.key}
              status={col.key}
              label={col.label}
              tasks={byStatus(col.key)}
              onCreate={(title) => createForColumn(col.key, title)}
              onOpen={setSelectedId}
              memberNames={memberNames}
            />
```

- [ ] **Step 4: Thread `memberNames` through `Column`** — `components/kanban/Column.tsx`

Update `Draggable` and `Column` to accept and forward `memberNames`:

```tsx
function Draggable({ task, onOpen, memberNames }: { task: Task; onOpen: (id: string) => void; memberNames: Record<string, string> }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onOpen(task.id)} style={{ cursor: 'pointer' }}>
      <TaskCard task={task} memberNames={memberNames} />
    </div>
  )
}

export default function Column({
  status, label, tasks, onCreate, onOpen, memberNames,
}: { status: TaskStatus; label: string; tasks: Task[]; onCreate: (title: string) => void; onOpen: (id: string) => void; memberNames: Record<string, string> }) {
  const { setNodeRef } = useDroppable({ id: status })
  const [title, setTitle] = useState('')
  return (
    <div ref={setNodeRef} data-testid={`column-${status}`}
      style={{ width: 280, flex: '0 0 280px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div className="mono" style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{label}</div>
      {tasks.map((t) => <Draggable key={t.id} task={t} onOpen={onOpen} memberNames={memberNames} />)}
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

- [ ] **Step 5: Show the resolved name in `TaskCard`** — `components/kanban/TaskCard.tsx`

```tsx
'use client'
import type { Task } from '@/lib/types'

export default function TaskCard({ task, memberNames }: { task: Task; memberNames: Record<string, string> }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, color: 'var(--text)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{task.title}</div>
      <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#bbb' }}>
        <span className="mono">{task.task_type}</span>
        {task.assignee && <span>· {memberNames[task.assignee] ?? task.assignee}</span>}
        {task.due_date && <span>· {task.due_date}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Mock useMembers in the other board-rendering test** — `tests/kanban-interactions.test.tsx`

This file renders `Board`, so add `useMembers` to its stub (alongside the existing `vi.spyOn(queries, …)` calls):

```tsx
  vi.spyOn(queries, 'useMembers').mockReturnValue({ data: [] } as never)
```
(`tests/kanban-open.test.tsx` already got its `useMembers` mock in Task 2; `tests/board.test.tsx` got its own in Step 1 here.)

- [ ] **Step 7: Run the board tests, the full suite, and the build**

Run:
```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend
npx vitest run tests/board.test.tsx tests/kanban-interactions.test.tsx tests/kanban-open.test.tsx
npx vitest run
npm run build
```
Expected: all pass; build compiles.

- [ ] **Step 8: Commit**

```bash
cd /Users/pomo/Documents/App/Bruno/idled-frontend && git add components/kanban/Board.tsx components/kanban/Column.tsx components/kanban/TaskCard.tsx tests/board.test.tsx tests/kanban-interactions.test.tsx
git commit -m "feat: show the assignee member name on the board card"
```

---

## Out of scope (this plan)

- Múltiples asignados por tarea; avatares; filtrar el tablero por asignado; autocompletar por nombre;
  `assignee_name` en backend; asignar desde la tarjeta de crear-tarea rápida.
- Backlog fast-follow heredado (`--text-muted`, `useUsers` con enabled, formato de fechas, etc.).

## Self-Review

**Spec coverage:**
- `is_project_member` + validación en create/update_task + endpoints 422 → Task 1. ✅
- Panel: input asignado → select de miembros + "Sin asignar" + fallback legacy; guarda external_id → Task 2. ✅
- Tarjeta: nombre resuelto vía `memberNames` (Board→Column→Draggable→TaskCard) + fallback crudo → Task 3. ✅
- `assignee`=external_id, `""`=sin asignar; sin migración → Tasks 1–3. ✅

**Placeholder scan:** sin TBD/TODO; todo el código completo (helper, validación, endpoints, select, board/column/card). Las notas "confirma el fixture `assignee: 'ED'`" / "usa el estilo de render del fichero" son instrucciones de fidelidad de test, no placeholders de código. ✅

**Type consistency:** `is_project_member(session, project_id, external_id)` (Task 1). `update.mutate({taskId, patch:{assignee}, parentId})` en el panel (Task 2) coincide con `useUpdateTask` existente (`{taskId, patch, parentId?}`). `useMembers(projectId)` → `Member[]` (usado en panel Task 2 y Board Task 3). `memberNames: Record<string,string>` consistente entre Board (Task 3), Column, Draggable y TaskCard. El select tiene `aria-label="asignado"` (Task 2) coincidiendo con el test. `TaskCard` pasa de `{task}` a `{task, memberNames}` (Task 3) — todos los renders de TaskCard (vía Draggable) pasan la prop. ✅
