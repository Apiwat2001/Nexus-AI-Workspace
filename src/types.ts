export interface Task {
  id: number;
  project_id: number;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  assignee_avatar?: string;
  due_date?: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Stat {
  status: string;
  count: number;
}

export interface Message {
  id: number;
  user_name: string;
  content: string;
  timestamp: string;
}
