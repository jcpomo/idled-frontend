# Bloque 1 · Marco global — Diseño

**Fecha:** 2026-07-20
**Proyecto:** IDLED IA — porte de funcionalidades del diseño de referencia (Gestor IMASD) a `idled-frontend` + `idled-backend`.
**Estado:** Aprobado (pendiente de revisión del spec por el usuario).

## Contexto

`idled-frontend` (Next.js 14) ya comparte el sistema de diseño del prototipo de referencia
(`gestor-de-proyectos-dark-mode`): mismos colores (`#080808`, acento `#FAC51C`), tipografías
(Outfit + JetBrains Mono) y animaciones. El prototipo es un mockup HTML sin backend; nuestro
proyecto sí tiene backend real (FastAPI + Postgres). Este es el **primer bloque** de 7 para
acercar la app al diseño, hecho **paso a paso** y **full-stack** (backend + frontend reales).

El "Marco global" es el chrome visible en todas las pantallas: la **barra superior (topbar)**
y la **barra lateral (sidebar)**. Es la base compartida, por eso va primero.

## Decisiones tomadas

1. **Color del sidebar:** gris medio `#565656`, fiel al diseño (contrasta con el negro del resto).
2. **Buscador global:** se incluye en este bloque, con endpoint real (no solo visual).
3. **Enfoque:** full-stack por función; datos reales persistidos.
4. **Mantener** las pantallas propias que no están en el diseño: **Asistente IA** y **Documentos**.

## Alcance

### Backend (`idled-backend`)

1. **Columna `color` en `projects`**
   - Nueva columna `color: str` (hex, p.ej. `#FAC51C`), NOT NULL con default.
   - Migración Alembic. Al crear proyecto, si no se envía color, se asigna uno de una
     **paleta IMASD** de forma rotatoria/determinista para que cada proyecto tenga color distinto.
   - Paleta: `#FAC51C, #FF7F24, #46C26A, #4FB6E8, #E5484D, #C9A227, #A9A9A9`.
   - `PATCH /api/projects/{id}` acepta `color` opcional para editarlo.
   - Reutilizable por los bloques Dashboard, Kanban y Detalle de tarea.

2. **`GET /api/projects` enriquecido**
   - Añadir `color` y `task_count` (COUNT de tareas de nivel superior, `parent_id IS NULL`,
     del proyecto) a cada elemento. Una sola consulta agregada (evitar N+1).

3. **Nuevo `GET /api/search?q=`**
   - Busca por título, en el ámbito del usuario (proyectos propios/compartidos y sus tareas).
   - Coincidencia `ILIKE %q%`, limitada (p.ej. 8 proyectos + 15 tareas).
   - Respuesta:
     ```json
     {
       "projects": [{"id","name","color"}],
       "tasks": [{"id","title","project_id","project_name","status"}]
     }
     ```
   - `q` vacío o < 2 caracteres → devuelve listas vacías (sin golpear la BD).

### Frontend (`idled-frontend`)

4. **Componente `Topbar`** (nuevo), renderizado en `app/(app)/layout.tsx` sobre el `main`.
   - Altura 62px, fondo `#0a0a0a`, borde inferior sutil.
   - **Breadcrumb** dinámico según la ruta (`crumbTop` / `crumbMain`): p.ej. Dashboard,
     "Proyecto / {nombre}", "Documentos", etc. Derivado con `usePathname()` + datos de proyecto.
   - Botón amarillo **"+ Nueva tarea"** → por ahora navega a `/dashboard` (el quick-create real
     llega en el Bloque 2). Documentado como interino.
   - **Campana** de notificaciones con punto si hay no leídas (reusa `useNotifications`) → `/notifications`.
   - **Buscador global**: input que abre un **panel de resultados** al escribir (debounce ~200ms,
     `GET /api/search`). Atajo de teclado **⌘K / Ctrl+K** enfoca el buscador. Resultados agrupados
     en "Proyectos" y "Tareas"; click navega a la pantalla correspondiente. Cierra con `Esc` o
     click fuera.

5. **`Sidebar` reformado** (`components/Sidebar.tsx`)
   - **Fondo `#565656`** (gris del diseño); ajustar colores de texto/hover para contraste.
   - **Ficha de usuario** abajo: avatar circular con **iniciales**, **nombre** y **rol**,
     decodificando el payload del JWT en cliente (helper nuevo `decodeToken()` en `lib/auth.ts`;
     el token trae `sub`, `name`, `role`). Sin llamada extra al backend.
   - **Sección PROYECTOS colapsable**: cabecera "PROYECTOS" con contador y chevron (estado
     persistido en `localStorage`). Lista de proyectos (de `useProjects`) con **punto de color**
     + nombre + **contador de tareas** (`task_count`), cada uno enlaza a `/project/[id]`.
   - Enlaces principales reordenados como el diseño: Dashboard, Asistente IA, Documentos,
     Chat de equipo, Notificaciones, Equipo. **Equipo** mantiene el tratamiento actual
     "próximamente" (enlace visible pero deshabilitado, sin ruta) hasta su bloque dedicado
     (Bloque F), para no dejar un enlace muerto.
   - Badge de no leídos en Notificaciones (existente); opcionalmente en Chat (sin backend nuevo
     en este bloque → se deja preparado pero puede quedar a 0).
   - Botón "Cerrar sesión" se conserva.

## Componentes y límites

- `Topbar` — presentacional + un hook de búsqueda (`useSearch(q)` en `lib/queries.ts`).
  Depende de: ruta actual, `useNotifications`, `useProjects`, nuevo `useSearch`.
- `SearchPanel` (interno del Topbar o componente aparte) — recibe resultados y callbacks de navegación.
- `Sidebar` — depende de `useProjects`, `decodeToken()`, badge de notificaciones.
- `decodeToken()` en `lib/auth.ts` — parsea el JWT (base64url del payload) y devuelve
  `{ sub, name, role } | null`. Puro, testeable.
- Backend: cambios acotados en `app/gestor/models.py`, `app/gestor/service.py`,
  `app/api/projects.py`, nuevo `app/api/search.py`, y una migración.

## Flujo de datos

- Sidebar/topbar montan al entrar al grupo `(app)` (tras el guard de auth).
- `useProjects` ya existe; se extiende su tipo para incluir `color` y `task_count`.
- Búsqueda: input → debounce → `useSearch(q)` (React Query, `enabled: q.length >= 2`) →
  `GET /api/search` → panel. Navegar cierra el panel y limpia la query.
- Identidad de usuario: `decodeToken(getToken())` en cliente para la ficha del sidebar.

## Manejo de errores

- `GET /api/search` con error → panel muestra "No se pudo buscar" (no rompe el topbar).
- Token inválido/ausente en `decodeToken` → devuelve `null`; sidebar muestra placeholder neutro
  ("Usuario") sin romper. El guard de auth ya redirige a `/login` si no hay token.
- `task_count` / `color` ausentes (respuesta antigua en caché) → valores por defecto (0, gris).

## Pruebas

- **Backend (pytest):**
  - Migración aplica y `projects.color` existe con default.
  - Crear 2 proyectos → colores distintos de la paleta.
  - `GET /api/projects` incluye `color` y `task_count` correcto (crear tareas y contar).
  - `PATCH /api/projects/{id}` cambia el color.
  - `GET /api/search`: coincidencias por título en proyectos y tareas; respeta ámbito del
    usuario (no devuelve datos de otros); `q` corto → vacío.
- **Frontend (Vitest + Testing Library):**
  - `decodeToken()` parsea un JWT de ejemplo (name/role/sub); token corrupto → null.
  - `Topbar`: breadcrumb correcto por ruta; ⌘K enfoca; escribir muestra resultados (mock fetch);
    Esc cierra.
  - `Sidebar`: lista proyectos con color y contador; sección colapsable; ficha de usuario con iniciales.
- **E2E (Playwright, smoke):** login → topbar visible → buscar "Serie" → click resultado → navega.

## Fuera de alcance (bloques posteriores)

- Quick-create real de tareas (Bloque 2 · Dashboard).
- Página de Equipo completa (Bloque F).
- Canales de chat / no leídos reales de chat (Bloque G).
- Cambiar el set de estados del Kanban a 5 (Bloque C · Proyecto).
