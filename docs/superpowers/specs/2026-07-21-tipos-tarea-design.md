# Bloque 2B · Tipos de tarea + plantillas de subtareas + crear tarea rápida — Diseño

**Fecha:** 2026-07-21
**Proyecto:** IDLED IA — porte del diseño de referencia (Gestor IMASD).
**Estado:** Aprobado (pendiente de revisión del spec por el usuario).

## Contexto

Bloque 2B (segunda mitad del Dashboard). El 2A (resumen) ya está en `origin/main`.
Hoy `Task.task_type` es un string libre (default "PPTO"); no hay catálogo de tipos ni plantillas.
El gestor (proyectos/tareas) usa propiedad/membresía, no RBAC. RBAC existe (7 roles) para el ERP.
`create_task` recibe `task_type` pero no genera subtareas. `create_subtask` crea una subtarea
(`Task` con `parent_id`).

Este bloque añade el subsistema estrella del diseño: un **catálogo de tipos de tarea con plantillas
de subtareas**, y la **creación rápida de tareas** que genera esas subtareas automáticamente.

## Decisiones tomadas

1. **Alcance:** catálogo **global** (compartido por toda la empresa), no por proyecto.
2. **Gestión:** solo **admin y dirección** pueden crear/editar/borrar tipos (nuevo permiso RBAC
   `task_types:write`); cualquier autenticado puede **leerlos y usarlos** al crear tareas.
3. **Plantilla de subtareas:** lista JSON ordenada de nombres, guardada en el propio tipo.
4. **Generación de subtareas:** server-side y atómica, vía una lista opcional `subtasks` al crear tarea.
5. **Semilla:** 3 tipos por defecto del diseño (PPTO, MUESTRAS, NUEVO DISEÑO).
6. **Enfoque:** full-stack, datos reales.

## Alcance

### Backend (`idled-backend`)

1. **Modelo `TaskType`** (global, tabla `task_types`):
   `{id: uuid, name: str (único), color: str, subtasks: list[str] (JSON, default []), position: int, created_at}`.
   - Migración Alembic + **semilla** de 3 filas (posición 0,1,2):
     - PPTO `#FAC51C`: `["Estudio Eng. y viabilidad","BOM","Solicitar RFQ","Creación y envío PPTO","Aprobación PPTO","Alta artículo"]`
     - MUESTRAS `#FF7F24`: `["Definir requisitos","Solicitar muestra a proveedor","Recepción de muestras","Validación de calidad","Informe de muestras"]`
     - NUEVO DISEÑO `#46C26A`: `["Brief de diseño","Bocetos / concepto","Modelado 3D","Render y revisión","Validación cliente","Entrega archivos producción"]`
   - Usa la columna SQLAlchemy `JSON` para `subtasks` (funciona en SQLite y Postgres).

2. **RBAC:** añadir `task_types:write` al set de `Role.DIRECCION` en `app/auth/roles.py`
   (admin ya es comodín). Reading no requiere permiso especial.

3. **Servicio `app/gestor/task_types_service.py`:**
   - `list_task_types(session) -> list[TaskType]` (orden por `position`, luego `name`).
   - `create_task_type(session, name, color, subtasks) -> TaskType` (position = max+1).
   - `update_task_type(session, id, *, name?, color?, subtasks?) -> TaskType | None` (patch parcial).
   - `delete_task_type(session, id) -> bool`.

4. **Endpoints `app/api/task_types.py`** (prefix `/api/task-types`):
   - `GET ""` — `Depends(get_current_user)` (cualquiera). Devuelve `[{id,name,color,subtasks,position}]`.
   - `POST ""` / `PATCH "/{id}"` / `DELETE "/{id}"` — `dependencies=[Depends(require_permission("task_types:write"))]`
     (403 si no tiene el permiso). Registrar el router en `app/main.py`.

5. **Generación de subtareas al crear tarea:**
   - `create_task(..., subtasks: list[str] | None = None)`: tras crear la tarea, si `subtasks` no es
     vacío, crea cada nombre como subtarea (`Task` con `parent_id`=nueva tarea, en orden, `position` incremental),
     en la misma transacción. Retrocompatible (default None → comportamiento actual).
   - `POST /api/projects/{id}/tasks` (`TaskBody`) gana `subtasks: list[str] | None = None`, pasado a `create_task`.
   - La respuesta sigue siendo `_task_dict(task)` (la tarea top-level); el front refetchea subtareas si hace falta.

### Frontend (`idled-frontend`)

6. **Data layer:**
   - Tipo `TaskType { id; name; color; subtasks: string[]; position: number }`.
   - api: `listTaskTypes`, `createTaskType(name,color,subtasks)`, `updateTaskType(id, patch)`, `deleteTaskType(id)`;
     `createTask` extendido con `subtasks?: string[]`.
   - hooks: `useTaskTypes`, `useCreateTaskType`, `useUpdateTaskType`, `useDeleteTaskType` (invalidan `['task-types']`);
     `useCreateTask` (o el existente) acepta `subtasks`.
   - Helper `canManageTypes(role: string | null): boolean` = role ∈ {'admin','direccion'} (para mostrar controles).

7. **`components/dashboard/TaskTypesManager.tsx`** (panel del Dashboard):
   - Lista de tipos (punto de color + nombre + nº de subtareas), seleccionable; botón "Nuevo tipo de tarea"
     (solo si `canManageTypes`).
   - Editor del tipo seleccionado: renombrar (input), borrar, **selector de color** (paleta), y **editor de
     plantilla de subtareas**: cada fila con reordenar (▲/▼), editar texto inline, borrar (×); "insertar aquí" (+)
     entre filas; "añadir subtarea". Todo persiste vía `updateTaskType` (patch de `subtasks`/`name`/`color`).
   - Si NO `canManageTypes`: se muestra en **lectura** (lista de tipos + sus subtareas, sin controles de edición).
   - Guardado: al editar se hace `updateTaskType(id, {subtasks})` etc. (optimista o al confirmar; el plan detalla).

8. **`components/dashboard/QuickCreateCard.tsx`** (card del Dashboard):
   - Input de título, **selector de proyecto** (de `useProjects`), **chips de tipo** (de `useTaskTypes`).
   - **Previsualización** de las subtareas de la plantilla del tipo seleccionado (`type.subtasks`).
   - Botón "Crear tarea y {N} subtareas" → `createTask(projectId, {title, task_type: type.name, subtasks: type.subtasks})`
     → invalida `['tasks',projectId]`, `['projects']`, `['my-tasks']`. Limpia el formulario.
   - Validación: requiere título y proyecto; si no hay proyectos, mensaje guía.

9. **Layout del Dashboard** (`app/(app)/dashboard/page.tsx`): reordenar a lo del diseño —
   fila de 2 columnas **QuickCreateCard (izq, ~1.5fr) + MyTasksCard (der, ~1fr)**, debajo el
   **TaskTypesManager**, y al final las **tarjetas de proyecto**. El saludo/stats se mantienen arriba.

## Componentes y límites

- Backend: `app/gestor/models.py` (TaskType), migración, `app/gestor/task_types_service.py` (CRUD),
  `app/api/task_types.py` (router), `app/auth/roles.py` (permiso), `create_task` en `service.py` +
  `TaskBody`/`crear_tarea` en `app/api/projects.py` (subtasks).
- Frontend: `lib/types.ts` (TaskType), `lib/api.ts` (+5 fns), `lib/queries.ts` (+hooks),
  `lib/auth.ts` o `lib/roles.ts` (`canManageTypes`), `components/dashboard/TaskTypesManager.tsx`,
  `components/dashboard/QuickCreateCard.tsx`, `app/(app)/dashboard/page.tsx`.

## Flujo de datos

- `useTaskTypes()` → `GET /api/task-types` → alimenta chips de QuickCreate y la lista del Manager.
- Editar tipo → `updateTaskType` → invalida `['task-types']`.
- Crear tarea rápida → `createTask` con `subtasks` → backend crea tarea + subtareas → invalida
  `['tasks',projectId]`/`['projects']`/`['my-tasks']` (la tarea aparece en el proyecto y en "Mis tareas" si aplica).
- Rol del usuario para `canManageTypes`: de `decodeToken(getToken())`.

## Manejo de errores

- Escritura de tipos sin permiso → backend 403; la UI ya oculta los controles a no-admin/dirección,
  pero si llega un 403 se muestra un aviso y no rompe.
- `GET /api/task-types` error → Manager y chips muestran estado vacío/aviso; el dashboard sigue usable.
- Crear tarea sin proyecto/título → botón deshabilitado + mensaje.
- Borrar un tipo NO borra tareas existentes de ese tipo (task_type es un string denormalizado; las
  tareas conservan su nombre de tipo). Se documenta.

## Pruebas

- **Backend (pytest, Docker):**
  - Migración crea `task_types` con las 3 semillas (name/color/subtasks correctos).
  - CRUD servicio: crear (position incremental), update parcial (name/color/subtasks), delete.
  - Endpoints: `GET` abierto (200 con auth); `POST/PATCH/DELETE` → **403** con rol `lectura`, **200** con `admin`
    y con `direccion`; validación de payload.
  - `create_task` con `subtasks=["a","b"]` crea la tarea + 2 subtareas (parent_id correcto, orden); sin `subtasks`
    no crea ninguna (retrocompat). Endpoint `POST /api/projects/{id}/tasks` con `subtasks` end-to-end.
- **Frontend (Vitest + Testing Library):**
  - `canManageTypes`: admin/direccion → true; otros → false.
  - hooks/api: `listTaskTypes` shape; `createTask` envía `subtasks`.
  - `TaskTypesManager`: lista tipos; con admin muestra controles y editar plantilla (reordenar/insertar/borrar/añadir)
    llama `updateTaskType`; con rol lectura NO muestra controles.
  - `QuickCreateCard`: seleccionar tipo previsualiza sus subtareas; "Crear tarea y N subtareas" llama `createTask`
    con `task_type` + `subtasks`.
  - dashboard: layout 2-col + manager + tarjetas render sin romper.

## Fuera de alcance (otros bloques / fast-follow)

- Panel de crear-tarea **en la vista Lista** del proyecto (con edición de subtareas antes de crear) → Bloque 3.
- Reordenar tipos (drag del propio tipo) → fast-follow; la creación usa `position` incremental.
- Migrar/renombrar en cascada el `task_type` de tareas existentes al renombrar un tipo → OOS
  (las tareas conservan el nombre anterior; se documenta).
- Iconos por tipo, tipos archivables, plantillas de campos (no solo subtareas) → OOS.
