import type { Project, Task, TaskStatus, TaskComment, Conversation, ChatMessage, DocumentItem } from '@/lib/types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function apiBase(): string {
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
    throw new ApiError(`API ${res.status} on ${path}`, res.status)
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
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string; status?: TaskStatus },
) => apiFetch<Task>(`/api/tasks/${taskId}`, { method: 'PATCH', body: patch, token })

export const deleteTask = (token: string, taskId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE', token })

export const moveTask = (token: string, taskId: string, status: TaskStatus, position: number) =>
  apiFetch<Task>(`/api/tasks/${taskId}/move`, { method: 'POST', body: { status, position }, token })

export const getTask = (token: string, taskId: string) =>
  apiFetch<Task>(`/api/tasks/${taskId}`, { token })

export const listSubtasks = (token: string, taskId: string) =>
  apiFetch<Task[]>(`/api/tasks/${taskId}/subtasks`, { token })

export const createSubtask = (
  token: string,
  parentId: string,
  input: { title: string; status?: TaskStatus },
) => apiFetch<Task>(`/api/tasks/${parentId}/subtasks`, { method: 'POST', body: input, token })

export const listComments = (token: string, taskId: string) =>
  apiFetch<TaskComment[]>(`/api/tasks/${taskId}/comments`, { token })

export const createComment = (token: string, taskId: string, content: string) =>
  apiFetch<TaskComment>(`/api/tasks/${taskId}/comments`, { method: 'POST', body: { content }, token })

export const updateComment = (token: string, commentId: string, content: string) =>
  apiFetch<TaskComment>(`/api/comments/${commentId}`, { method: 'PATCH', body: { content }, token })

export const deleteComment = (token: string, commentId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/comments/${commentId}`, { method: 'DELETE', token })

export const listConversations = (token: string) =>
  apiFetch<Conversation[]>('/api/conversations', { token })

export const listMessages = (token: string, conversationId: string) =>
  apiFetch<ChatMessage[]>(`/api/conversations/${conversationId}/messages`, { token })

export const listDocuments = (token: string) =>
  apiFetch<DocumentItem[]>('/api/documentos', { token })
