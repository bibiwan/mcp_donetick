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
} from '../types/donetick.js';

export class DoneTickClient {
  private http: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
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
        const resp = await this.http.get<Chore[]>('/api/v1/chores', { params });
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

      return chores;
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
      return (resp.data as any)?.res || resp.data;
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
        subTasks: input.subTasks ?? [],
      };

      if (input.frequencyMetadata !== undefined) {
        payload.frequencyMetadata = input.frequencyMetadata;
      } else if (payload.frequencyType === 'interval') {
        payload.frequencyMetadata = { unit: 'days' };
      }

      if (input.description !== undefined) payload.description = input.description;
      if (input.dueDate !== undefined) {
        payload.dueDate = input.dueDate;
        payload.nextDueDate = input.dueDate;
      }
      if (input.projectId !== undefined) payload.projectId = input.projectId;
      if (input.assignedTo !== undefined) payload.assignedTo = input.assignedTo;
      if (input.notification !== undefined) payload.notification = input.notification;
      if (input.notificationMetadata !== undefined) payload.notificationMetadata = input.notificationMetadata;
      if (input.thingTrigger !== undefined) payload.thingTrigger = input.thingTrigger;

      let resp;
      try {
        resp = await this.http.post('/api/v1/chores', payload);
      } catch (err: any) {
        if (err.response?.status === 404) {
          resp = await this.http.post('/eapi/v1/chore', payload);
        } else {
          throw err;
        }
      }
      return (resp.data as any)?.res || resp.data;
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
      let existing: Chore | null = null;
      try {
        existing = await this.getChore(input.id);
      } catch {
        // Continue if getChore fails
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
        subTasks: input.subTasks ?? existing?.subTasks ?? [],
      };

      if (input.frequencyMetadata !== undefined) {
        payload.frequencyMetadata = input.frequencyMetadata;
      } else if (existing?.frequencyMetadata !== undefined && existing?.frequencyMetadata !== null) {
        payload.frequencyMetadata = existing.frequencyMetadata;
      } else if (payload.frequencyType === 'interval') {
        payload.frequencyMetadata = { unit: 'days' };
      }

      if (input.description !== undefined) {
        payload.description = input.description;
      } else if (existing?.description !== undefined) {
        payload.description = existing.description;
      }

      if (input.nextDueDate !== undefined) {
        payload.nextDueDate = input.nextDueDate;
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

      const resp = await this.http.put('/api/v1/chores', payload);
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
      if (input.completedTime) payload.completedTime = input.completedTime;
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
   * Updates the due date of a chore.
   */
  async setChoreDueDate(choreId: number, dueDate: string): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/dueDate`, { dueDate });
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `setChoreDueDate(${choreId})`);
    }
  }

  /**
   * Updates the priority of a chore (0-5).
   */
  async setChorePriority(choreId: number, priority: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/priority`, { priority });
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `setChorePriority(${choreId})`);
    }
  }

  /**
   * Updates status of a chore.
   */
  async setChoreStatus(choreId: number, status: number): Promise<any> {
    try {
      const resp = await this.http.put(`/api/v1/chores/${choreId}/status`, { status });
      return (resp.data as any)?.res || resp.data;
    } catch (error) {
      this.handleError(error, `setChoreStatus(${choreId})`);
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
}
