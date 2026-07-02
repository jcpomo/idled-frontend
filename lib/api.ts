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
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string },
) => apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch, token })

export const deleteTask = (token: string, taskId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE', token })

export const moveTask = (token: string, taskId: string, status: TaskStatus, position: number) =>
  apiFetch<Task>(`/api/tasks/${taskId}/move`, { method: 'POST', body: { status, position }, token })
