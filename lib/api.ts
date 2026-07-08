import type { Project, Task, TaskStatus, TaskComment, Conversation, ConversationMessage, ChatMessage, DocumentItem, UserDir, Member, Notification } from '@/lib/types'

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
  input: { title: string; task_type?: string; status?: TaskStatus; assignee?: string | null; due_date?: string | null; start_date?: string | null },
) => apiFetch<Task>(`/api/projects/${projectId}/tasks`, { method: 'POST', body: input, token })

export const updateTask = (
  token: string,
  taskId: string,
  patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; start_date?: string | null; description?: string; status?: TaskStatus },
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
  apiFetch<ConversationMessage[]>(`/api/conversations/${conversationId}/messages`, { token })

export const deleteConversation = (token: string, id: string) =>
  apiFetch<{ ok: boolean }>(`/api/conversations/${id}`, { method: 'DELETE', token })

export const listDocuments = (token: string) =>
  apiFetch<DocumentItem[]>('/api/documentos', { token })

export const deleteDocument = (token: string, id: string) =>
  apiFetch<{ ok: boolean }>(`/api/documentos/${id}`, { method: 'DELETE', token })

export const listUsers = (token: string) =>
  apiFetch<UserDir[]>('/api/users', { token })

export const listMembers = (token: string, projectId: string) =>
  apiFetch<Member[]>(`/api/projects/${projectId}/members`, { token })

export const addMember = (token: string, projectId: string, externalId: string) =>
  apiFetch<Member[]>(`/api/projects/${projectId}/members`, { method: 'POST', body: { external_id: externalId }, token })

export const removeMember = (token: string, projectId: string, externalId: string) =>
  apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/members/${externalId}`, { method: 'DELETE', token })

export const listNotifications = (token: string) =>
  apiFetch<Notification[]>('/api/notifications', { token })

export const markNotificationRead = (token: string, id: string) =>
  apiFetch<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST', token })

export const markAllNotificationsRead = (token: string) =>
  apiFetch<{ marked: number }>('/api/notifications/read-all', { method: 'POST', token })

export const listGlobalMessages = (token: string) =>
  apiFetch<ChatMessage[]>('/api/team-chat/global/messages', { token })

export const listProjectMessages = (token: string, projectId: string) =>
  apiFetch<ChatMessage[]>(`/api/team-chat/projects/${projectId}/messages`, { token })
