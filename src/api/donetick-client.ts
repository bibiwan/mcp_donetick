import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  Chore,
  CreateChoreInput,
  UpdateChoreInput,
  CompleteChoreInput,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Thing,
  CreateThingInput,
  UpdateThingInput,
  Filter,
  CircleInfo,
  CircleMember,
  Label,
  CreateLabelInput,
  UpdateLabelInput,
  SubTask,
  ChoreDetail,
  ChoreHistory,
  ModifyHistoryInput,
  HistoryQueryOptions,
  TimeSession,
  UpdateTimeSessionInput,
  ThingHistoryEntry,
} from '../types/donetick.js';
import { DateOptions, toRfc3339, requireRfc3339 } from '../utils/dates.js';
import { htmlToText, textToHtml } from '../utils/html.js';

export class DoneTickClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private dateOptions: DateOptions;

  constructor(baseUrl: string, token: string, dateOptions: DateOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.dateOptions = dateOptions;
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'secretkey': token,
        'Authorization': `Bearer ${token}`,
      },
      timeout: 15000,
    });
  }

  private handleError(error: unknown, action: string): never {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<{ error?: string; message?: string }>;
      const status = axiosErr.response?.status;
      const data = axiosErr.response?.data;
      const errorMsg = data?.error || data?.message || axiosErr.message;
      throw new Error(`DoneTick API Error during ${action} (HTTP ${status || 'Unknown'}): ${errorMsg}`);
    }
    throw new Error(`DoneTick API Error during ${action}: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** Normalizes a caller-supplied date to RFC3339; `null` means "clear the field". */
  private date(value: string | null | undefined): string | null {
    return toRfc3339(value, this.dateOptions);
  }

  /** Same, for fields DoneTick cannot accept as null. */
  private requiredDate(value: string): string {
    return requireRfc3339(value, this.dateOptions);
  }

  /**
   * Presents a chore's description as plain text while keeping the stored
   * markup alongside it.
   *
   * DoneTick stores descriptions as HTML, but chores created through older
   * versions of this connector hold plain text, so callers otherwise see an
   * arbitrary mix of `<p>Wipe the shelves</p>` and `Wipe the shelves`.
   * `descriptionHtml` retains the original so an update can round-trip it.
   */
  private normalizeDescription<T extends { description?: string | null }>(entity: T): T {
    if (!entity || typeof entity !== 'object') {
      return entity;
    }
    const raw = entity.description;
    if (raw === undefined || raw === null || raw === '') {
      return entity;
    }
    const text = htmlToText(raw);
    // Only surface the raw form when it actually carries markup, so a
    // plain-text description does not come back duplicated.
    return text === raw ? entity : { ...entity, description: text, descriptionHtml: raw };
  }

  /**
   * DoneTick's SubTask model serializes its position as `orderId`, not `order`.
   * Sending `order` silently leaves every subtask at position 0, so translate
   * here and keep accepting both spellings from callers.
   */
  private normalizeSubTasks(subTasks: SubTask[]): Record<string, any>[] {
    return subTasks.map((st, idx) => {
      const raw = st as Record<string, any>;
      const position = raw.orderId ?? raw.order ?? idx;
      const normalized: Record<string, any> = {
        name: st.name,
        orderId: position,
      };
      if (raw.id !== undefined) normalized.id = raw.id;
      if (raw.completedAt !== undefined) normalized.completedAt = raw.completedAt;
      if (raw.completedBy !== undefined) normalized.completedBy = raw.completedBy;
      if (raw.parentId !== undefined) normalized.parentId = raw.parentId;
      return normalized;
    });
  }

  // ==================== CHORES ====================

  /**
   * Retrieves all chores. Attempts /api/v1/chores with fallback to /eapi/v1/chore.
   */
  async listChores(options?: { includeSubtasks?: boolean; projectId?: number; status?: number; search?: string }): Promise<Chore[]> {
    try {
      const params: Record<string, any> = {};
      if (options?.includeSubtasks !== undefined) {
        params.includeSubtasks = options.includeSubtasks;
      }
      if (options?.projectId !== undefined) {
        params.projectId = options.projectId;
      }

      let chores: Chore[] = [];
      try {
        const resp = await this.http.get<Chore[]>('/api/v1/chores/', { params });
        chores = Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Fallback to eapi
          const resp = await this.http.get<Chore[]>('/eapi/v1/chore', { params });
          chores = Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
        } else {
          throw err;
        }
      }

      // Filter in memory if search / status options provided
      if (options?.search) {
        const q = options.search.toLowerCase();
        chores = chores.filter(
          (c) =>
            c.name?.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q)
        );
      }

      if (options?.status !== undefined) {
        chores = chores.filter((c) => c.status === options.status);
      }

      return chores.map((c) => this.normalizeDescription(c));
    } catch (error) {
      this.handleError(error, 'listChores');
    }
  }

  /**
   * Retrieves detailed information about a specific chore by ID.
   */
  async getChore(id: number): Promise<Chore> {
    try {
      const resp = await this.http.get(`/api/v1/chores/${id}`);
      const chore = (resp.data as any)?.res || resp.data;
      return this.normalizeDescription(chore);
    } catch (error) {
      this.handleError(error, `getChore(${id})`);
    }
  }

  /**
   * Creates a new chore.
   */
  async createChore(input: CreateChoreInput): Promise<Chore> {
    try {
      const payload: Record<string, any> = {
        name: input.name,
        frequencyType: input.frequencyType || 'once',
        assignStrategy: input.assignStrategy || 'no_assignee',
        isPrivate: input.isPrivate ?? false,
        isActive: input.isActive ?? true,
        isRolling: input.isRolling ?? false,
        frequency: input.frequency ?? 1,
        priority: input.priority ?? 0,
        points: input.points ?? 0,
        labelsV2: input.labelsV2 ?? [],
        assignees: input.assignees ?? [],
      };

      if (input.frequencyMetadata !== undefined) {
        payload.frequencyMetadata = input.frequencyMetadata;
      } else if (payload.frequencyType === 'interval') {
        payload.frequencyMetadata = { unit: 'days' };
      }

      payload.subTasks = this.normalizeSubTasks((input.subTasks ?? []) as SubTask[]);

      // Wrap plain text so multi-line descriptions render as written in the
      // web UI, which treats this field as HTML. Existing markup passes through.
      if (input.description !== undefined) payload.description = textToHtml(input.description);

      // `ChoreReq` only declares `nextDueDate`; `dueDate` is accepted here as a
      // caller-side alias and normalized, since a bare `YYYY-MM-DD` fails Go's
      // RFC3339 binding with an opaque 400.
      const rawDue = input.nextDueDate ?? input.dueDate;
      if (rawDue !== undefined) {
        payload.nextDueDate = this.date(rawDue);
      }
      if (input.completionWindow !== undefined) payload.completionWindow = input.completionWindow;
      if (input.requireApproval !== undefined) payload.requireApproval = input.requireApproval;
      if (input.projectId !== undefined) payload.projectId = input.projectId;
      if (input.assignedTo !== undefined) payload.assignedTo = input.assignedTo;
      if (input.notification !== undefined) payload.notification = input.notification;
      if (input.notificationMetadata !== undefined) payload.notificationMetadata = input.notificationMetadata;
      if (input.thingTrigger !== undefined) payload.thingTrigger = input.thingTrigger;

      let resp;
      try {
        resp = await this.http.post('/api/v1/chores/', payload);
      } catch (err: any) {
        if (err.response?.status === 404) {
          resp = await this.http.post('/eapi/v1/chore', payload);
        } else {
          throw err;
        }
      }

      // `POST /chores/` answers `{"res": 37}` — the new id alone. Returning that
      // number leaves the caller with nothing to chain on, so resolve it into
      // the full chore.
      const created = (resp.data as any)?.res ?? resp.data;
      if (typeof created === 'number') {
        try {
          return await this.getChore(created);
        } catch {
          return { id: created } as Chore;
        }
      }
      return created;
    } catch (error) {
      this.handleError(error, 'createChore');
    }
  }

  /**
   * Updates an existing chore with full support for partial updates.
   * Automatically fetches current chore state to preserve existing required fields.
   */
  async updateChore(input: UpdateChoreInput): Promise<Chore> {
    try {
      // This is a read-modify-write: `EditChore` replaces the whole chore and
      // diffs subtasks/labels by id, so a failed read must abort. Swallowing it
      // would send empty `subTasks`/`labelsV2` and wipe both server-side.
      let existing: Chore;
      try {
        existing = await this.getChore(input.id);
      } catch (err: any) {
        throw new Error(
          `Cannot update chore #${input.id}: reading its current state failed, ` +
            `and updating blind would delete its subtasks and labels. Cause: ${err.message}`
        );
      }

      const payload: Record<string, any> = {
        id: input.id,
        name: input.name ?? existing?.name ?? '',
        frequencyType: input.frequencyType ?? existing?.frequencyType ?? 'once',
        assignStrategy: input.assignStrategy ?? existing?.assignStrategy ?? 'no_assignee',
        isPrivate: input.isPrivate !== undefined ? input.isPrivate : (existing?.isPrivate ?? false),
        isActive: input.isActive !== undefined ? input.isActive : (existing?.isActive ?? true),
        isRolling: input.isRolling !== undefined ? input.isRolling : (existing?.isRolling ?? false),
        frequency: input.frequency !== undefined ? input.frequency : (existing?.frequency ?? 1),
        priority: input.priority !== undefined ? input.priority : (existing?.priority ?? 0),
        points: input.points !== undefined ? input.points : (existing?.points ?? 0),
        labelsV2: input.labelsV2 ?? existing?.labelsV2 ?? [],
        assignees: input.assignees ?? existing?.assignees ?? [],
        subTasks: this.normalizeSubTasks((input.subTasks ?? existing?.subTasks ?? []) as SubTask[]),
      };

      // Preserve the optimistic-concurrency token so a concurrent edit surfaces
      // as a 403 instead of silently clobbering someone else's change.
      if (existing?.updatedAt) {
        payload.updatedAt = existing.updatedAt;
      }
      if (input.completionWindow !== undefined) {
        payload.completionWindow = input.completionWindow;
      } else if (existing?.completionWindow !== undefined) {
        payload.completionWindow = existing.completionWindow;
      }
      if (input.requireApproval !== undefined) {
        payload.requireApproval = input.requireApproval;
      } else if (existing?.requireApproval !== undefined) {
        payload.requireApproval = existing.requireApproval;
      }

      if (input.frequencyMetadata !== undefined) {
        payload.frequencyMetadata = input.frequencyMetadata;
      } else if (existing?.frequencyMetadata !== undefined && existing?.frequencyMetadata !== null) {
        payload.frequencyMetadata = existing.frequencyMetadata;
      } else if (payload.frequencyType === 'interval') {
        payload.frequencyMetadata = { unit: 'days' };
      }

      if (input.description !== undefined) {
        payload.description = textToHtml(input.description);
      } else if (existing?.description !== undefined) {
        // `existing.description` was normalized to text on read; send back the
        // stored markup so an unrelated update does not flatten it.
        payload.description = (existing as any).descriptionHtml ?? existing.description;
      }

      if (input.nextDueDate !== undefined) {
        payload.nextDueDate = this.date(input.nextDueDate);
      } else if (existing?.nextDueDate !== undefined) {
        payload.nextDueDate = existing.nextDueDate;
      }

      if (input.projectId !== undefined) {
        payload.projectId = input.projectId;
      } else if (existing?.projectId !== undefined) {
        payload.projectId = existing.projectId;
      }

      if (input.assignedTo !== undefined) {
        payload.assignedTo = input.assignedTo;
      } else if (existing?.assignedTo !== undefined) {
        payload.assignedTo = existing.assignedTo;
      }

      if (input.notification !== undefined) {
        payload.notification = input.notification;
      } else if (existing?.notification !== undefined) {
        payload.notification = existing.notification;
      }

      if (input.notificationMetadata !== undefined) {
        payload.notificationMetadata = input.notificationMetadata;
      } else if (existing?.notificationMetadata !== undefined && existing?.notificationMetadata !== null) {
        payload.notificationMetadata = existing.notificationMetadata;
      }

      if (input.thingTrigger !== undefined) {
        payload.thingTrigger = input.thingTrigger;
      }

      const resp = await this.http.put('/api/v1/chores/', payload);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `updateChore(${input.id})`);
    }
  }

  /**
   * Marks a chore as completed.
   */
  async completeChore(input: CompleteChoreInput): Promise<any> {
    try {
      const payload: Record<string, any> = {};
      if (input.notes) payload.notes = input.notes;
      if (input.completedTime) payload.completedTime = this.requiredDate(input.completedTime);
      if (input.completedBy) payload.completedBy = input.completedBy;

      const resp = await this.http.post(`/api/v1/chores/${input.choreId}/do`, payload);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `completeChore(${input.choreId})`);
    }
  }

  /**
   * Undo the last completion of a chore.
   */
  async undoChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.post(`/api/v1/chores/${choreId}/undo`, {});
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `undoChore(${choreId})`);
    }
  }

  /**
   * Deletes a chore.
   */
  async deleteChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/chores/${choreId}`);
      return (resp.data as any)?.message || resp.data;
    } catch (error) {
      this.handleError(error, `deleteChore(${choreId})`);
    }
  }

  /**
   * Updates the due date of a chore, or clears it when `dueDate` is null.
   *
   * `DueDateReq.UpdatedAt` carries `binding:"required"` server-side and doubles
   * as an optimistic-concurrency token: omitting it is a hard HTTP 400, and a
   * stale value is a 403. We therefore read the chore first and echo back its
   * current `updatedAt`.
   */
  async setChoreDueDate(choreId: number, dueDate: string | null): Promise<Chore> {
    try {
      const normalized = this.date(dueDate);
      const current = await this.getChore(choreId);
      const updatedAt = current.updatedAt ?? new Date().toISOString();

      const resp = await this.http.put(`/api/v1/chores/${choreId}/dueDate`, {
        dueDate: normalized,
        updatedAt,
      });
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `setChoreDueDate(${choreId})`);
    }
  }

  /**
   * Updates the priority of a chore.
   *
   * The dedicated endpoint validates `gt=-1,lt=5`, so it accepts 0-4 only —
   * 5 is rejected with HTTP 400 even though DoneTick's own chore payload has
   * no such ceiling. Verified against a live instance.
   */
  async setChorePriority(choreId: number, priority: number): Promise<any> {
    if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
      throw new Error(
        `Invalid priority ${priority}. DoneTick's priority endpoint accepts integers 0-4 ` +
          `(0 = none, 1 = highest ... 4 = lowest).`
      );
    }
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/priority`, { priority });
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `setChorePriority(${choreId})`);
    }
  }

  /**
   * Skips the current occurrence of a chore.
   */
  async skipChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.post(`/api/v1/chores/${choreId}/skip`, {});
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `skipChore(${choreId})`);
    }
  }

  /**
   * Sends a nudge/reminder for a chore.
   */
  async nudgeChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.post(`/api/v1/chores/${choreId}/nudge`, {});
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `nudgeChore(${choreId})`);
    }
  }

  // ==================== PROJECTS ====================

  /**
   * Lists all projects in the circle.
   */
  async listProjects(): Promise<Project[]> {
    try {
      const resp = await this.http.get<Project[]>('/api/v1/projects');
      return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
    } catch (error) {
      this.handleError(error, 'listProjects');
    }
  }

  /**
   * Creates a new project.
   */
  async createProject(input: CreateProjectInput): Promise<Project> {
    try {
      const resp = await this.http.post('/api/v1/projects', input);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, 'createProject');
    }
  }

  /**
   * Updates an existing project.
   */
  async updateProject(input: UpdateProjectInput): Promise<Project> {
    try {
      const resp = await this.http.put(`/api/v1/projects/${input.id}`, input);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `updateProject(${input.id})`);
    }
  }

  /**
   * Deletes a project.
   */
  async deleteProject(id: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/projects/${id}`);
      return (resp.data as any)?.message || resp.data;
    } catch (error) {
      this.handleError(error, `deleteProject(${id})`);
    }
  }

  // ==================== THINGS ====================

  /**
   * Helper to normalize thing type and state according to DoneTick rules (only 'number', 'boolean', 'text' are valid).
   */
  private normalizeThingTypeAndState(rawType?: string, rawState?: string): { type: string; state: string } {
    let type = (rawType || 'text').toLowerCase().trim();
    if (type !== 'number' && type !== 'boolean' && type !== 'text') {
      // Fallback non-standard types to 'text'
      type = 'text';
    }

    let state = rawState !== undefined ? String(rawState).trim() : '';

    if (type === 'number') {
      const parsed = parseInt(state, 10);
      state = isNaN(parsed) ? '0' : String(parsed);
    } else if (type === 'boolean') {
      state = state === 'true' || state === '1' ? 'true' : 'false';
    }

    return { type, state };
  }

  /**
   * Lists all things (entities/sensors/smart devices/items).
   */
  async listThings(): Promise<Thing[]> {
    try {
      const resp = await this.http.get<Thing[]>('/api/v1/things');
      return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
    } catch (error) {
      this.handleError(error, 'listThings');
    }
  }

  /**
   * Retrieves a thing by its ID.
   */
  async getThing(id: number): Promise<Thing> {
    try {
      const things = await this.listThings();
      const found = things.find((t) => t.id === id);
      if (!found) {
        throw new Error(`Thing #${id} not found`);
      }
      return found;
    } catch (error) {
      this.handleError(error, `getThing(${id})`);
    }
  }

  /**
   * Creates a new thing in DoneTick with validated type ('number' | 'boolean' | 'text') and state.
   */
  async createThing(input: CreateThingInput): Promise<Thing> {
    try {
      const { type, state } = this.normalizeThingTypeAndState(input.type, input.state);

      const payload = {
        name: input.name,
        type,
        state,
      };

      const resp = await this.http.post('/api/v1/things', payload);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, 'createThing');
    }
  }

  /**
   * Updates an existing thing. Supports partial updates.
   */
  async updateThing(input: UpdateThingInput): Promise<Thing> {
    try {
      let existing: Thing | null = null;
      try {
        existing = await this.getThing(input.id);
      } catch {
        // ignore
      }

      const name = input.name ?? existing?.name ?? '';
      const rawType = input.type ?? existing?.type ?? 'text';
      const rawState = input.state !== undefined ? input.state : (existing?.state ?? '');

      const { type, state } = this.normalizeThingTypeAndState(rawType, rawState);

      const payload = {
        id: input.id,
        name,
        type,
        state,
      };

      const resp = await this.http.put('/api/v1/things', payload);
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `updateThing(${input.id})`);
    }
  }

  /**
   * Updates state of a thing by ID and triggers associated chore due dates.
   */
  async updateThingState(id: number, value: string): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/things/${id}/state`, null, {
        params: { value },
      });
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `updateThingState(${id})`);
    }
  }

  /**
   * Deletes a thing by ID.
   */
  async deleteThing(id: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/things/${id}`);
      return (resp.data as any)?.message || resp.data;
    } catch (error) {
      this.handleError(error, `deleteThing(${id})`);
    }
  }

  // ==================== FILTERS ====================

  /**
   * Lists all custom filters.
   */
  async listFilters(): Promise<Filter[]> {
    try {
      const resp = await this.http.get<Filter[]>('/api/v1/filters');
      return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
    } catch (error) {
      this.handleError(error, 'listFilters');
    }
  }

  // ==================== CIRCLES & USERS ====================

  /**
   * Lists circles the user belongs to.
   */
  async getCircles(): Promise<CircleInfo[]> {
    try {
      const resp = await this.http.get('/api/v1/circles');
      return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
    } catch (error) {
      this.handleError(error, 'getCircles');
    }
  }

  /**
   * Lists members of the circle.
   */
  async getCircleMembers(): Promise<CircleMember[]> {
    try {
      const resp = await this.http.get('/api/v1/circles/members');
      return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
    } catch (error) {
      this.handleError(error, 'getCircleMembers');
    }
  }

  // ==================== LABELS ====================

  /**
   * Lists all labels. Falls back to extracting labels from chores if /api/v1/labels requires JWT.
   */
  async listLabels(): Promise<Label[]> {
    try {
      try {
        const resp = await this.http.get('/api/v1/labels');
        return Array.isArray(resp.data) ? resp.data : (resp.data as any)?.res || [];
      } catch (err: any) {
        if (err.response?.status === 401) {
          // Fallback: extract unique labels attached to existing chores
          const chores = await this.listChores();
          const labelMap = new Map<number, Label>();
          for (const c of chores) {
            if (c.labelsV2 && Array.isArray(c.labelsV2)) {
              for (const l of c.labelsV2) {
                const id = l.id ?? (l as any).labelId;
                if (id !== undefined && !labelMap.has(id)) {
                  labelMap.set(id, { id, labelId: id, name: l.name, color: l.color });
                }
              }
            }
          }
          return Array.from(labelMap.values());
        }
        throw err;
      }
    } catch (error) {
      this.handleError(error, 'listLabels');
    }
  }

  /**
   * Creates a new label in DoneTick.
   */
  async createLabel(input: CreateLabelInput): Promise<Label> {
    try {
      const resp = await this.http.post('/api/v1/labels', input);
      return (resp.data as any)?.res || resp.data;
    } catch (error: any) {
      if (error.response?.status === 401 && String(error.response?.data?.message).includes('invalid number of segments')) {
        throw new Error(
          "DoneTick limitation: The /api/v1/labels endpoint requires a JWT token (DoneTick's backend does not support API Keys on label creation routes). Please create labels in the DoneTick Web UI."
        );
      }
      this.handleError(error, 'createLabel');
    }
  }

  /**
   * Updates an existing label in DoneTick.
   */
  async updateLabel(input: UpdateLabelInput): Promise<Label> {
    try {
      const resp = await this.http.put('/api/v1/labels', input);
      return (resp.data as any)?.res || resp.data;
    } catch (error: any) {
      if (error.response?.status === 401 && String(error.response?.data?.message).includes('invalid number of segments')) {
        throw new Error(
          "DoneTick limitation: The /api/v1/labels endpoint requires a JWT token (DoneTick's backend does not support API Keys on label routes). Please manage labels in the DoneTick Web UI."
        );
      }
      this.handleError(error, `updateLabel(${input.id})`);
    }
  }

  /**
   * Deletes a label by ID in DoneTick.
   */
  async deleteLabel(id: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/labels/${id}`);
      return resp.data;
    } catch (error: any) {
      if (error.response?.status === 401 && String(error.response?.data?.message).includes('invalid number of segments')) {
        throw new Error(
          "DoneTick limitation: The /api/v1/labels endpoint requires a JWT token (DoneTick's backend does not support API Keys on label routes). Please manage labels in the DoneTick Web UI."
        );
      }
      this.handleError(error, `deleteLabel(${id})`);
    }
  }

  // ==================== COMPLETION HISTORY ====================

  /**
   * Reads the richer `/details` projection of a chore.
   *
   * This is the only endpoint exposing `lastCompletedDate`, `lastCompletedBy`
   * and the accumulated timer `duration`. Note that DoneTick's
   * `totalCompletedCount` actually counts every history row — reschedules and
   * skips included — so it is deliberately renamed downstream.
   */
  async getChoreDetail(id: number): Promise<ChoreDetail> {
    try {
      const resp = await this.http.get(`/api/v1/chores/${id}/details`);
      const detail = (resp.data as any)?.res ?? resp.data;
      return this.normalizeDescription(detail);
    } catch (error) {
      this.handleError(error, `getChoreDetail(${id})`);
    }
  }

  /**
   * Full history of one chore: completions, skips, reschedules and misses,
   * newest first.
   */
  async getChoreHistory(id: number): Promise<ChoreHistory[]> {
    try {
      const resp = await this.http.get(`/api/v1/chores/${id}/history`);
      const data = (resp.data as any)?.res ?? resp.data;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.handleError(error, `getChoreHistory(${id})`);
    }
  }

  /**
   * Circle-wide history.
   *
   * DoneTick's `limit` query parameter is a number of **days**, not a row
   * count, and it offers no date-range filter — so `since`/`until`/`statuses`
   * are applied client-side after the fetch.
   */
  async getChoresHistory(options: HistoryQueryOptions = {}): Promise<ChoreHistory[]> {
    try {
      const params: Record<string, any> = { limit: options.days ?? 30 };
      if (options.includeMembers) {
        params.members = true;
      }

      const resp = await this.http.get('/api/v1/chores/history', { params });
      const data = (resp.data as any)?.res ?? resp.data;
      let entries: ChoreHistory[] = Array.isArray(data) ? data : [];

      const since = options.since ? Date.parse(this.requiredDate(options.since)) : undefined;
      const until = options.until ? Date.parse(this.requiredDate(options.until)) : undefined;

      if (since !== undefined || until !== undefined) {
        entries = entries.filter((entry) => {
          if (!entry.performedAt) return false;
          const at = Date.parse(entry.performedAt);
          if (Number.isNaN(at)) return false;
          if (since !== undefined && at < since) return false;
          if (until !== undefined && at > until) return false;
          return true;
        });
      }

      if (options.statuses?.length) {
        const wanted = new Set(options.statuses);
        entries = entries.filter((entry) => wanted.has(entry.status ?? -1));
      }

      return entries;
    } catch (error) {
      this.handleError(error, 'getChoresHistory');
    }
  }

  /** Edits one history entry (when it was performed, its due date, its notes). */
  async modifyHistoryEntry(input: ModifyHistoryInput): Promise<any> {
    try {
      const payload: Record<string, any> = {};
      if (input.performedAt !== undefined) payload.performedAt = this.requiredDate(input.performedAt);
      if (input.dueDate !== undefined) payload.dueDate = this.date(input.dueDate);
      if (input.notes !== undefined) payload.notes = input.notes;

      const resp = await this.http.put(
        `/api/v1/chores/${input.choreId}/history/${input.historyId}`,
        payload
      );
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `modifyHistoryEntry(${input.choreId}/${input.historyId})`);
    }
  }

  /** Deletes one history entry. */
  async deleteHistoryEntry(choreId: number, historyId: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/chores/${choreId}/history/${historyId}`);
      return (resp.data as any)?.message ?? resp.data;
    } catch (error) {
      this.handleError(error, `deleteHistoryEntry(${choreId}/${historyId})`);
    }
  }

  // ==================== TIME TRACKING ====================

  /** Starts (or resumes) the chore's timer. */
  async startChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/start`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `startChore(${choreId})`);
    }
  }

  /** Pauses the chore's timer, banking the elapsed time. */
  async pauseChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/pause`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `pauseChore(${choreId})`);
    }
  }

  /**
   * Reads the chore's time sessions.
   *
   * DoneTick answers with a bare object (all-zero when no session exists)
   * rather than an array, so normalize to a list.
   */
  async getChoreTimer(choreId: number): Promise<TimeSession[]> {
    try {
      const resp = await this.http.get(`/api/v1/chores/${choreId}/timer`);
      const data = (resp.data as any)?.res ?? resp.data;
      if (Array.isArray(data)) {
        return data;
      }
      if (data && typeof data === 'object' && (data.id ?? 0) !== 0) {
        return [data as TimeSession];
      }
      return [];
    } catch (error) {
      this.handleError(error, `getChoreTimer(${choreId})`);
    }
  }

  /** Clears the chore's accumulated timer. */
  async resetChoreTimer(choreId: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/timer/reset`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `resetChoreTimer(${choreId})`);
    }
  }

  /**
   * Rewrites a time session's boundaries.
   *
   * This is the only way to record a duration after the fact: DoneTick's
   * manual-duration handler (`PUT /chores/{id}/timer`) exists in the source but
   * is not wired into any route, and `POST /{id}/do` has no `timeSpent` field.
   */
  async updateTimeSession(input: UpdateTimeSessionInput): Promise<any> {
    try {
      const payload: Record<string, any> = {};
      if (input.startTime !== undefined) payload.startTime = this.requiredDate(input.startTime);
      if (input.endTime !== undefined) payload.endTime = this.requiredDate(input.endTime);

      const resp = await this.http.put(
        `/api/v1/chores/${input.choreId}/timer/${input.sessionId}`,
        payload
      );
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `updateTimeSession(${input.choreId}/${input.sessionId})`);
    }
  }

  /** Deletes one time session. */
  async deleteTimeSession(choreId: number, sessionId: number): Promise<any> {
    try {
      const resp = await this.http.delete(`/api/v1/chores/${choreId}/timer/${sessionId}`);
      return (resp.data as any)?.message ?? resp.data;
    } catch (error) {
      this.handleError(error, `deleteTimeSession(${choreId}/${sessionId})`);
    }
  }

  // ==================== SUBTASK COMPLETION ====================

  /**
   * Ticks or unticks a single subtask without rewriting the chore.
   *
   * Pass `completedAt: null` to untick. Note that completing the parent chore
   * resets every subtask on a recurring chore — DoneTick calls
   * `ResetSubtasksCompletion` inside its own complete handler.
   */
  async setSubtaskCompletion(
    choreId: number,
    subtaskId: number,
    completedAt: string | null
  ): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/subtask`, {
        id: subtaskId,
        choreId,
        completedAt: completedAt === null ? null : this.requiredDate(completedAt),
      });
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `setSubtaskCompletion(${choreId}/${subtaskId})`);
    }
  }

  // ==================== ARCHIVE / ASSIGNEE / APPROVAL ====================

  /** Lists archived chores, which `listChores` hides. */
  async listArchivedChores(): Promise<Chore[]> {
    try {
      const resp = await this.http.get('/api/v1/chores/archived');
      const data = (resp.data as any)?.res ?? resp.data;
      return Array.isArray(data) ? data.map((c) => this.normalizeDescription(c)) : [];
    } catch (error) {
      this.handleError(error, 'listArchivedChores');
    }
  }

  async archiveChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/archive`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `archiveChore(${choreId})`);
    }
  }

  async unarchiveChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/unarchive`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `unarchiveChore(${choreId})`);
    }
  }

  /** Reassigns a chore. `AssigneeReq.UpdatedAt` is required server-side. */
  async setChoreAssignee(choreId: number, userId: number): Promise<any> {
    try {
      const current = await this.getChore(choreId);
      const resp = await this.http.put(`/api/v1/chores/${choreId}/assignee`, {
        assignee: userId,
        updatedAt: current.updatedAt ?? new Date().toISOString(),
      });
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `setChoreAssignee(${choreId})`);
    }
  }

  /** Approves a completion that is pending review (`requireApproval` chores). */
  async approveChore(choreId: number): Promise<any> {
    try {
      const resp = await this.http.post(`/api/v1/chores/${choreId}/approve`, {});
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `approveChore(${choreId})`);
    }
  }

  /** Rejects a completion that is pending review. */
  async rejectChore(choreId: number, notes?: string): Promise<any> {
    try {
      const payload: Record<string, any> = {};
      if (notes) payload.notes = notes;
      const resp = await this.http.post(`/api/v1/chores/${choreId}/reject`, payload);
      return (resp.data as any)?.res ?? resp.data;
    } catch (error) {
      this.handleError(error, `rejectChore(${choreId})`);
    }
  }

  /** State-change history of a thing (sensor / counter). */
  async getThingHistory(thingId: number): Promise<ThingHistoryEntry[]> {
    try {
      const resp = await this.http.get(`/api/v1/things/${thingId}/history`);
      const data = (resp.data as any)?.res ?? resp.data;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      this.handleError(error, `getThingHistory(${thingId})`);
    }
  }

}
