# Bloque 2A · Dashboard de resumen — Diseño

**Fecha:** 2026-07-21
**Proyecto:** IDLED IA — porte del diseño de referencia (Gestor IMASD) a `idled-frontend` + `idled-backend`.
**Estado:** Aprobado (pendiente de revisión del spec por el usuario).

## Contexto

Segundo bloque del porte de diseño. El Bloque 1 (Marco global) ya está en `origin/main`.
El Dashboard del prototipo tiene 6 piezas; por tamaño se parte en **2A (resumen)** y
**2B (tipos de tarea + plantillas + crear tarea rápida)**. Este spec cubre **solo 2A**.

Hoy `app/(app)/dashboard/page.tsx` es mínimo (input de crear proyecto + lista de tarjetas
enlazando a `/project/[id]`). `task_type` es un texto libre (default "PPTO"); no hay catálogo
de tipos ni plantillas (eso es 2B). El backend ya devuelve `color` y `task_count` por proyecto
(Bloque 1) y tiene `assignee` (external_id del miembro) por tarea.

## Decisiones tomadas

1. **Buscador hero:** se **elimina** (redundante con el buscador global del topbar del Bloque 1).
   Se conservan los **chips como filtros** de la lista "Mis tareas".
2. **Avatares en tarjetas de proyecto:** **aplazados** a fast-follow (requieren miembros por
   proyecto). Las tarjetas llevan color + progreso ahora.
3. **Crear tarea rápida:** fuera de 2A (depende de tipos+plantillas → Bloque 2B).
4. **Enfoque:** full-stack, datos reales.

## Alcance

### Backend (`idled-backend`)

1. **`GET /api/tasks/mine`** — mis tareas asignadas, en todos mis proyectos accesibles.
   - Nuevo endpoint en el router existente `app/api/tasks.py` (prefix `/api/tasks`), con
     `Depends(get_current_user)`. **CRÍTICO:** declararlo **ANTES** de `@router.get("/{task_id}")`
     (línea 79), o FastAPI interpretará `mine` como un `task_id` UUID y dará 422.
   - Servicio `list_my_tasks(session, user_external_id) -> list[dict]`: tareas **top-level**
     (`parent_id IS NULL`) con `assignee == user_external_id`, en proyectos accesibles
     (propios o donde es miembro), **excluyendo estado `done`**, ordenadas por `due_date`
     (nulos al final) y luego `created_at`.
   - Cada item: `{id, title, project_id, project_name, status, due_date, subtask_done, subtask_total}`.
     - `subtask_total` = nº de subtareas (`parent_id == task.id`); `subtask_done` = las de esas en
       estado `done`. Calculado con una consulta agregada sobre las subtareas de las tareas
       devueltas (sin N+1).
   - Ámbito: reutiliza el patrón de `list_projects` (owned OR member) para acotar proyectos.

2. **`GET /api/projects` gana `done_count`** — nº de tareas top-level en estado `done` por
   proyecto. Se añade a `list_projects_with_counts` (misma consulta agregada que `task_count`,
   filtrando por estado; o una segunda agregación). El front calcula progreso = `done_count/task_count`.

### Frontend (`idled-frontend`)

Reescribir `app/(app)/dashboard/page.tsx` al layout del diseño (fondo `#080808`, cards `#111`,
acento `#FAC51C`, tipografías existentes). Piezas:

3. **Saludo + stats.** "Buenos días/Buenas tardes/Buenas noches, {nombre}" (nombre de
   `decodeToken(getToken())`, saludo por hora local) + línea "Tienes **N tareas** para hoy y
   **M atrasadas**." Calculado en cliente desde `/api/tasks/mine`:
   - hoy = `due_date === todayISO()`; atrasada = `due_date < todayISO()` (ambas sobre tareas
     no-hechas, que ya vienen filtradas). Reutiliza `todayISO` de `lib/dates.ts`.

4. **"Mis tareas de hoy"** (card): lista desde `/api/tasks/mine` con:
   - barra lateral de color por estado (mapa de estados existente),
   - título, fecha límite coloreada (roja si atrasada, ámbar si hoy), y progreso `subtask_done/subtask_total`,
   - **chips de filtro** encima: `Mis tareas` (todas, por defecto) · `Hoy` · `Atrasadas` ·
     `Esta semana` — filtran la lista en cliente (sin backend extra),
   - click en una fila → navega a `/project/{project_id}` (abrir el detalle de la tarea concreta
     queda como fast-follow; por ahora abre el proyecto),
   - vacío: "No tienes tareas asignadas".

5. **Tarjetas de proyecto con progreso** (grid): por proyecto (de `useProjects`, ya con `color`,
   `task_count`, y ahora `done_count`): punto/franja de color, nombre, "`task_count` tareas",
   **barra de progreso** con `done_count/task_count` (0 si sin tareas), % a la derecha. Click →
   `/project/{id}`. Cabecera "Proyectos" con un botón discreto **"+ Nuevo proyecto"** que abre
   un input inline (conserva `useCreateProject`, hoy en el dashboard).

## Componentes y límites

- `app/(app)/dashboard/page.tsx` — orquesta las 3 secciones; si crece, extraer subcomponentes.
- `components/dashboard/MyTasksCard.tsx` — lista + chips de filtro; consume `useMyTasks`.
- `components/dashboard/ProjectCard.tsx` — tarjeta con barra de progreso (reutilizable).
- `lib/api.ts`: `listMyTasks(token)`; `lib/queries.ts`: `useMyTasks()` (React Query, token-gated).
- Tipo nuevo `MyTask` en `lib/types.ts`; `Project` gana `done_count?: number`.
- Backend: `list_my_tasks` en `app/gestor/service.py`; endpoint en `app/api/tasks.py`;
  `done_count` en `list_projects_with_counts`.

## Flujo de datos

- `useMyTasks()` → `GET /api/tasks/mine` → alimenta saludo/stats + card "Mis tareas" (filtros en cliente).
- `useProjects()` (existente, extendido) → tarjetas de proyecto con progreso.
- Identidad: `decodeToken` (Bloque 1) para el nombre del saludo.

## Manejo de errores

- `/api/tasks/mine` error → la card muestra "No se pudieron cargar tus tareas" (no rompe el resto).
- Sin tareas → stats "0 para hoy y 0 atrasadas" + card vacía; el dashboard sigue usable.
- `done_count`/`task_count` ausentes (caché viejo) → progreso 0, sin romper.

## Pruebas

- **Backend (pytest, Docker):**
  - `list_my_tasks`: solo mis tareas asignadas, solo top-level, excluye `done`, en proyectos
    accesibles (propios y compartidos), NO devuelve tareas de otros; incluye `project_name` y
    subtask_done/total correctos (crear subtareas y contar).
  - `GET /api/projects` incluye `done_count` correcto (crear tareas, marcar alguna done).
- **Frontend (Vitest + Testing Library):**
  - Saludo por hora (mockear hora) y stats (hoy/atrasadas) derivadas de un `mine` de ejemplo.
  - `MyTasksCard`: render de filas + filtros (Hoy/Atrasadas/Esta semana filtran bien) + vacío.
  - `ProjectCard`: barra de progreso a `done/total` (incl. 0 tareas → 0%).
  - dashboard: crear proyecto sigue funcionando (input inline).

## Fuera de alcance (otros bloques / fast-follow)

- **Tipos de tarea + plantillas + crear tarea rápida** → Bloque 2B.
- Avatares del equipo en las tarjetas de proyecto → fast-follow.
- Abrir el **detalle de la tarea concreta** desde "Mis tareas" (hoy abre el proyecto) → fast-follow.
- Chip `#PPTO`/etiquetas y `Sin asignar` del hero → dependen de etiquetas/tipos (bloques posteriores).
