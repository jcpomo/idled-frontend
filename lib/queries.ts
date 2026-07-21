'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import { uploadDocument } from '@/lib/documents'
import { getToken } from '@/lib/auth'
import type { TaskStatus } from '@/lib/types'

function token(): string {
  return getToken() ?? ''
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(token()),
    enabled: Boolean(getToken()),
  })
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
    enabled: Boolean(projectId) && Boolean(getToken()),
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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
    },
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      taskId: string
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; start_date?: string | null; description?: string; status?: TaskStatus }
      parentId?: string
    }) => api.updateTask(token(), v.taskId, v.patch),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { taskId: string; parentId?: string }) => api.deleteTask(token(), v.taskId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => api.listSubtasks(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useCreateSubtask(parentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title: string; status?: TaskStatus }) =>
      api.createSubtask(token(), parentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subtasks', parentId] }),
  })
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => api.listComments(token(), taskId),
    enabled: Boolean(taskId) && Boolean(getToken()),
  })
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api.createComment(token(), taskId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}

export function useUpdateComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { commentId: string; content: string }) =>
      api.updateComment(token(), v.commentId, v.content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => api.deleteComment(token(), commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', taskId] }),
  })
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.listConversations(token()),
    enabled: Boolean(getToken()),
  })
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.listMessages(token(), conversationId),
    enabled: Boolean(conversationId) && Boolean(getToken()),
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteConversation(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.listDocuments(token()),
    enabled: Boolean(getToken()),
    refetchInterval: (query) => {
      const docs = query.state.data
      const pending = (docs ?? []).some((d) => d.status === 'uploaded' || d.status === 'processing')
      return pending ? 3000 : false
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadDocument(token(), file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(token()),
    enabled: Boolean(getToken()),
  })
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: ['members', projectId],
    queryFn: () => api.listMembers(token(), projectId),
    enabled: Boolean(projectId) && Boolean(getToken()),
  })
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (externalId: string) => api.addMember(token(), projectId, externalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (externalId: string) => api.removeMember(token(), projectId, externalId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectId] }),
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(token()),
    enabled: Boolean(getToken()),
    refetchInterval: 20000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(token()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useSearch(q: string) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => api.searchAll(token(), trimmed),
    enabled: Boolean(getToken()) && trimmed.length >= 2,
    staleTime: 10000,
  })
}

export function useMyTasks() {
  return useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.listMyTasks(token()),
    enabled: Boolean(getToken()),
  })
}

export function useTaskTypes() {
  return useQuery({
    queryKey: ['task-types'],
    queryFn: () => api.listTaskTypes(token()),
    enabled: Boolean(getToken()),
  })
}
export function useCreateTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string; subtasks: string[] }) => api.createTaskType(token(), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useUpdateTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: { name?: string; color?: string; subtasks?: string[] } }) => api.updateTaskType(token(), v.id, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useDeleteTaskType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteTaskType(token(), id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-types'] }),
  })
}
export function useQuickCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { projectId: string; title: string; task_type: string; subtasks?: string[] }) =>
      api.createTask(token(), v.projectId, { title: v.title, task_type: v.task_type, subtasks: v.subtasks }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', v.projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['my-tasks'] })
    },
  })
}
