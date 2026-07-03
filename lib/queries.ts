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
    mutationFn: (v: { taskId: string; status: TaskStatus; position: number; parentId?: string }) =>
      api.moveTask(token(), v.taskId, v.status, v.position),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['task', v.taskId] })
      if (v.parentId) qc.invalidateQueries({ queryKey: ['subtasks', v.parentId] })
    },
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      taskId: string
      patch: { title?: string; task_type?: string; assignee?: string | null; due_date?: string | null; description?: string; status?: TaskStatus }
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
