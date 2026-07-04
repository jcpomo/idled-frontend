export type TaskStatus = 'open' | 'progress' | 'review' | 'done'

export interface Project {
  id: string
  name: string
  created_at?: string | null
}

export interface Task {
  id: string
  title: string
  task_type: string
  status: TaskStatus
  assignee: string | null
  due_date: string | null
  position: number
  description: string | null
  parent_id: string | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_external_id: string
  author_name: string | null
  content: string
  created_at: string
  edited_at: string | null
  mine: boolean
}
