'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      taskId: string
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string }
    }) => api.updateTask(token(), v.taskId, v.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(token(), taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}
