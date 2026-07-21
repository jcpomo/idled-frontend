export type TaskStatus = 'open' | 'progress' | 'review' | 'done'

export interface Project {
  id: string
  name: string
  color?: string
  task_count?: number
  created_at?: string | null
  is_owner?: boolean
}

export interface UserDir {
  external_id: string
  name: string | null
}

export interface Member {
  external_id: string
  name: string | null
  is_owner: boolean
}

export interface Task {
  id: string
  title: string
  task_type: string
  status: TaskStatus
  assignee: string | null
  due_date: string | null
  start_date: string | null
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

export interface Conversation {
  id: string
  title: string | null
  created_at: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ChatMessage {
  id: string
  scope: string
  project_id: string | null
  author_external_id: string
  author_name: string
  content: string
  created_at: string
  mine: boolean
}

export interface DocumentItem {
  id: string
  filename: string
  status: string
  created_at: string
  error: string | null
}

export interface Notification {
  id: string
  type: string
  message: string
  task_id: string | null
  project_id: string | null
  read: boolean
  created_at: string
}

export interface SearchProject {
  id: string
  name: string
  color: string
}

export interface SearchTask {
  id: string
  title: string
  project_id: string
  project_name: string
  status: string
}

export interface SearchResult {
  projects: SearchProject[]
  tasks: SearchTask[]
}
