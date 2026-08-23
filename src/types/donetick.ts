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
  /** Seconds before the due date during which the chore may be completed. */
  completionWindow?: number | null;
  syncVersion?: number;
}

export interface ThingTrigger {
  thingID: number;
  triggerState: string;
  condition?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | string;
}

export interface CreateChoreInput {
  name: string;
  description?: string;
  dueDate?: string; // RFC3339, YYYY-MM-DD or 'YYYY-MM-DD HH:mm'
  /** Alias of dueDate, matching DoneTick's own field name. */
  nextDueDate?: string;
  completionWindow?: number;
  requireApproval?: boolean;
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
  completionWindow?: number;
  requireApproval?: boolean;
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

/**
 * Response of `GET /api/v1/chores/{id}/details`.
 *
 * DoneTick exposes two different shapes for a chore: the `Chore` above
 * (`GET /chores/{id}`) and this richer read model. Completion tracking
 * (`lastCompletedDate`, `lastCompletedBy`, `totalCompletedCount`) and the
 * accumulated timer (`duration`) only exist here.
 */
export interface ChoreDetail {
  id: number;
  name: string;
  description?: string | null;
  frequencyType?: string;
  nextDueDate?: string | null;
  assignedTo?: number | null;
  lastCompletedDate?: string | null;
  lastCompletedBy?: number | null;
  totalCompletedCount?: number;
  priority?: number;
  notes?: string | null;
  createdBy?: number;
  completionWindow?: number | null;
  subTasks?: SubTask[] | null;
  status?: number;
  /** Accumulated timer duration, in seconds. */
  duration?: number;
  startTime?: string | null;
  timerUpdatedAt?: string | null;
  projectId?: number;
  isActive?: boolean;
  syncVersion?: number;
}

/** A chore merged with its `/details` read model, as returned to MCP clients. */
export type ChoreWithDetail = Chore & {
  lastCompletedDate?: string | null;
  lastCompletedBy?: number | null;
  totalCompletedCount?: number;
  duration?: number;
  startTime?: string | null;
  timerUpdatedAt?: string | null;
  lastCompletionNotes?: string | null;
};

/**
 * DoneTick's `ChoreHistoryStatus`. This is the only reliable way to tell a
 * completion apart from a reschedule — `Chore.updatedAt` conflates both.
 */
export const CHORE_HISTORY_STATUS = {
  0: 'started',
  1: 'completed',
  2: 'skipped',
  3: 'pending_approval',
  4: 'rejected',
  5: 'missed',
  6: 'rescheduled',
} as const;

export type ChoreHistoryStatusName = (typeof CHORE_HISTORY_STATUS)[keyof typeof CHORE_HISTORY_STATUS];

/** One entry of `GET /api/v1/chores/{id}/history`. */
export interface ChoreHistory {
  id: number;
  choreId: number;
  performedAt?: string | null;
  completedBy?: number;
  assignedTo?: number | null;
  notes?: string | null;
  dueDate?: string | null;
  updatedAt?: string | null;
  createdAt?: string;
  status?: number;
  points?: number | null;
  /** Duration in seconds, computed by DoneTick from the linked time sessions. */
  duration?: number | null;
  syncVersion?: number;
}

/** A history entry annotated with the human-readable status name. */
export type AnnotatedChoreHistory = ChoreHistory & {
  statusName?: ChoreHistoryStatusName | 'unknown';
  choreName?: string;
};

export interface ModifyHistoryInput {
  choreId: number;
  historyId: number;
  performedAt?: string;
  dueDate?: string;
  notes?: string;
}

export interface HistoryQueryOptions {
  /** How many days back DoneTick should look (its `limit` query param). */
  days?: number;
  /** Include other circle members' entries, not just the token owner's. */
  includeMembers?: boolean;
  /** Client-side lower bound on `performedAt`; DoneTick has no such filter. */
  since?: string;
  /** Client-side upper bound on `performedAt`. */
  until?: string;
  /** Keep only these history statuses (numeric codes). */
  statuses?: number[];
}

export const TIME_SESSION_STATUS = {
  0: 'active',
  1: 'paused',
  2: 'completed',
} as const;

export interface PauseLogEntry {
  start?: string;
  end?: string | null;
  duration?: number;
  updatedBy?: number;
}

/** One entry of `GET /api/v1/chores/{id}/timer`. */
export interface TimeSession {
  id: number;
  choreId: number;
  choreHistoryId?: number;
  startTime?: string;
  endTime?: string | null;
  /** Duration in seconds. */
  duration?: number;
  status?: number;
  pauseLog?: PauseLogEntry[] | null;
  updatedBy?: number;
  updatedAt?: string;
}

export interface UpdateTimeSessionInput {
  choreId: number;
  sessionId: number;
  startTime?: string;
  endTime?: string;
}

export interface ThingHistoryEntry {
  id?: number;
  thingId?: number;
  state?: string;
  updatedAt?: string;
  [key: string]: any;
}
