export type FrequencyType =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'adaptive'
  | 'interval'
  | 'days_of_the_week'
  | 'day_of_the_month'
  | 'trigger'
  | 'no_repeat';

export type AssignmentStrategy =
  | 'no_assignee'
  | 'least_assigned'
  | 'least_completed'
  | 'random'
  | 'keep_last_assigned'
  | 'random_except_last_assigned'
  | 'round_robin';

export interface ChoreAssignee {
  userId: number;
}

export interface Label {
  id?: number;
  labelId?: number;
  name?: string;
  color?: string;
  created_by?: number;
}

export interface CreateLabelInput {
  name: string;
  color?: string;
}

export interface UpdateLabelInput {
  id: number;
  name?: string;
  color?: string;
}

export interface SubTask {
  id?: number;
  choreId?: number;
  name: string;
  order?: number;
  completed?: boolean;
}

export interface NotificationMetadata {
  dueDate?: boolean;
  completion?: boolean;
  nagging?: boolean;
  predue?: boolean;
  circleGroup?: boolean;
  circleGroupID?: number;
  templates?: { value: number; unit: 'm' | 'h' | 'd' }[];
}

export interface Chore {
  id: number;
  name: string;
  description?: string;
  frequencyType?: FrequencyType;
  frequency?: number;
  frequencyMetadata?: Record<string, any>;
  nextDueDate?: string | null;
  isRolling?: boolean;
  isPrivate?: boolean;
  assignedTo?: number;
  assignees?: ChoreAssignee[];
  assignStrategy?: AssignmentStrategy;
  isActive?: boolean;
  notification?: boolean;
  notificationMetadata?: NotificationMetadata | Record<string, any>;
  labels?: string[] | null;
  labelsV2?: Label[];
  circleId?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: number;
  updatedBy?: number;
  thingChore?: any;
  status?: number;
  priority?: number;
  points?: number;
  projectId?: number;
  project?: Project;
  subTasks?: SubTask[];
  requireApproval?: boolean;
}

export interface ThingTrigger {
  thingID: number;
  triggerState: string;
  condition?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | string;
}

export interface CreateChoreInput {
  name: string;
  description?: string;
  dueDate?: string; // RFC3339 or YYYY-MM-DD
  frequencyType?: FrequencyType;
  frequency?: number;
  frequencyMetadata?: Record<string, any>;
  priority?: number; // 0 to 5
  points?: number;
  projectId?: number;
  assignedTo?: number;
  assignees?: any[];
  assignStrategy?: AssignmentStrategy;
  isActive?: boolean;
  isRolling?: boolean;
  isPrivate?: boolean;
  notification?: boolean;
  notificationMetadata?: NotificationMetadata;
  thingTrigger?: ThingTrigger;
  labelsV2?: { name: string; color?: string }[];
  subTasks?: { name: string; order?: number }[];
}

export interface UpdateChoreInput {
  id: number;
  name?: string;
  description?: string;
  nextDueDate?: string;
  frequencyType?: FrequencyType;
  frequency?: number;
  frequencyMetadata?: Record<string, any>;
  priority?: number;
  points?: number;
  projectId?: number;
  assignedTo?: number;
  assignees?: any[];
  assignStrategy?: AssignmentStrategy;
  isActive?: boolean;
  isRolling?: boolean;
  isPrivate?: boolean;
  notification?: boolean;
  notificationMetadata?: NotificationMetadata;
  thingTrigger?: ThingTrigger;
  labelsV2?: { name: string; color?: string }[];
  subTasks?: SubTask[];
}

export interface CompleteChoreInput {
  choreId: number;
  notes?: string;
  completedTime?: string; // RFC3339 format, defaults to now
  completedBy?: number;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  circleId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface UpdateProjectInput {
  id: number;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}

export type ThingType = 'number' | 'boolean' | 'text';

export interface Thing {
  id: number;
  name: string;
  type: ThingType | string;
  state?: string;
  circleId?: number;
  userID?: number;
  createdAt?: string;
  updatedAt?: string;
  thingChores?: any[];
}

export interface CreateThingInput {
  name: string;
  type?: ThingType | string;
  state?: string;
}

export interface UpdateThingInput {
  id: number;
  name?: string;
  type?: ThingType | string;
  state?: string;
}

export interface Filter {
  id: number;
  name: string;
  description?: string;
  conditions?: any;
  circleId?: number;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CircleMember {
  id: number;
  name: string;
  email?: string;
  role?: string;
  points?: number;
}

export interface CircleInfo {
  id: number;
  name: string;
  members?: CircleMember[];
}
