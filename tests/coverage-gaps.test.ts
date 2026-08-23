import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DoneTickClient } from '../src/api/donetick-client.js';
import { sanitizeDueTime, sanitizeTimeZone, sanitizeUrl } from '../src/config.js';

vi.mock('axios');

describe('config sanitizers', () => {
  describe('sanitizeDueTime', () => {
    it('accepts HH:mm and HH:mm:ss', () => {
      expect(sanitizeDueTime('07:30')).toBe('07:30');
      expect(sanitizeDueTime('7:30')).toBe('7:30');
      expect(sanitizeDueTime('07:30:15')).toBe('07:30:15');
    });

    it('falls back to 18:00 for anything unparseable', () => {
      expect(sanitizeDueTime(undefined)).toBe('18:00');
      expect(sanitizeDueTime('')).toBe('18:00');
      expect(sanitizeDueTime('noon')).toBe('18:00');
      expect(sanitizeDueTime('25')).toBe('18:00');
    });

    it('trims surrounding whitespace', () => {
      expect(sanitizeDueTime('  09:00  ')).toBe('09:00');
    });
  });

  describe('sanitizeTimeZone', () => {
    it('keeps a zone ICU knows', () => {
      expect(sanitizeTimeZone('Europe/Paris')).toBe('Europe/Paris');
      expect(sanitizeTimeZone('UTC')).toBe('UTC');
    });

    it('falls back to UTC when unset', () => {
      expect(sanitizeTimeZone(undefined)).toBe('UTC');
      expect(sanitizeTimeZone('   ')).toBe('UTC');
    });

    it('falls back to UTC for a zone ICU rejects', () => {
      expect(sanitizeTimeZone('Mars/Olympus_Mons')).toBe('UTC');
    });
  });

  describe('sanitizeUrl', () => {
    it('strips trailing slashes', () => {
      expect(sanitizeUrl('https://done.example///')).toBe('https://done.example');
    });

    it('refuses a non-http protocol', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBe('http://localhost:2021');
    });

    it('falls back for unparseable input and for nothing at all', () => {
      expect(sanitizeUrl('not a url')).toBe('http://localhost:2021');
      expect(sanitizeUrl(undefined)).toBe('http://localhost:2021');
    });
  });
});

describe('DoneTickClient - fallback and error branches', () => {
  let mockAxiosInstance: any;
  let client: DoneTickClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
    client = new DoneTickClient('https://donetick.test', 'tok', { timeZone: 'UTC' });
  });

  describe('error surfacing', () => {
    it('wraps a non-axios error without inventing a status', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('socket hang up'));
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      await expect(client.getChore(1)).rejects.toThrow(/getChore\(1\).*socket hang up/);
    });

    it('prefers the API error field over the axios message', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 403, data: { error: 'not your chore' } },
        message: 'Request failed',
      });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.getChore(1)).rejects.toThrow(/HTTP 403.*not your chore/);
    });

    it('falls back to the message field when there is no error field', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 400, data: { message: 'bad input' } },
      });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.getChore(1)).rejects.toThrow(/bad input/);
    });
  });

  describe('setChoreDueDate resilience', () => {
    it('stamps the current time when the chore has no updatedAt', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: { id: 1, name: 'C' } } });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.setChoreDueDate(1, '2026-10-10T12:00:00Z');

      const sent = mockAxiosInstance.put.mock.calls[0][1];
      expect(typeof sent.updatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(sent.updatedAt))).toBe(false);
    });

    it('rejects an unparseable date before touching the network', async () => {
      await expect(client.setChoreDueDate(1, 'next tuesday')).rejects.toThrow(/Invalid date/);
      expect(mockAxiosInstance.put).not.toHaveBeenCalled();
    });
  });

  describe('setChoreAssignee resilience', () => {
    it('stamps the current time when the chore has no updatedAt', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: { id: 1, name: 'C' } } });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.setChoreAssignee(1, 3);

      expect(typeof mockAxiosInstance.put.mock.calls[0][1].updatedAt).toBe('string');
    });
  });

  describe('listChores fallbacks', () => {
    it('unwraps a res envelope from the eapi fallback', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: { res: [{ id: 1, name: 'C' }] } });

      expect(await client.listChores()).toHaveLength(1);
    });

    it('rethrows a non-404 rather than falling back', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'boom' } },
      });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.listChores()).rejects.toThrow(/boom/);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('searches name and description case-insensitively', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          res: [
            { id: 1, name: 'Wash Car' },
            { id: 2, name: 'Dishes', description: 'in the CAR port' },
            { id: 3, name: 'Laundry' },
          ],
        },
      });

      const result = await client.listChores({ search: 'car' });

      expect(result.map((c) => c.id)).toEqual([1, 2]);
    });

    it('tolerates chores with neither name nor description while searching', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [{ id: 1 }] } });

      expect(await client.listChores({ search: 'x' })).toEqual([]);
    });
  });

  describe('labels fallback when the API key is refused', () => {
    it('derives labels from the chores when /labels returns 401', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({
          data: {
            res: [
              { id: 1, name: 'A', labelsV2: [{ id: 3, name: 'Kitchen', color: '#fff' }] },
              { id: 2, name: 'B', labelsV2: [{ labelId: 4, name: 'Weekly' }] },
              { id: 3, name: 'C', labelsV2: [{ id: 3, name: 'Kitchen' }] },
              { id: 4, name: 'D', labelsV2: null },
              { id: 5, name: 'E' },
            ],
          },
        });

      const labels = await client.listLabels();

      // Deduplicated by id, accepting both `id` and `labelId` spellings.
      expect(labels.map((l) => l.id).sort()).toEqual([3, 4]);
    });

    it('rethrows a non-401 from /labels', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'labels down' } },
      });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.listLabels()).rejects.toThrow(/labels down/);
    });

    it('explains the JWT-only limitation on create', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'token contains an invalid number of segments' } },
      });

      await expect(client.createLabel({ name: 'L' })).rejects.toThrow(/requires a JWT token/);
    });

    it('explains it on update and delete too', async () => {
      const jwtError = {
        response: { status: 401, data: { message: 'invalid number of segments' } },
      };
      mockAxiosInstance.put.mockRejectedValueOnce(jwtError);
      mockAxiosInstance.delete.mockRejectedValueOnce(jwtError);

      await expect(client.updateLabel({ id: 1, name: 'L' })).rejects.toThrow(/JWT/);
      await expect(client.deleteLabel(1)).rejects.toThrow(/JWT/);
    });
  });

  describe('thing type and state normalization', () => {
    it('coerces a number thing to an integer string', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createThing({ name: 'Counter', type: 'number', state: '42.9' });

      expect(mockAxiosInstance.post.mock.calls[0][1]).toEqual({
        name: 'Counter',
        type: 'number',
        state: '42',
      });
    });

    it('defaults an unparseable number state to zero', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createThing({ name: 'Counter', type: 'number', state: 'lots' });

      expect(mockAxiosInstance.post.mock.calls[0][1].state).toBe('0');
    });

    it('normalizes boolean-ish states', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { res: { id: 1 } } });

      await client.createThing({ name: 'S', type: 'boolean', state: '1' });
      expect(mockAxiosInstance.post.mock.calls[0][1].state).toBe('true');

      await client.createThing({ name: 'S', type: 'boolean', state: 'nope' });
      expect(mockAxiosInstance.post.mock.calls[1][1].state).toBe('false');
    });

    it('downgrades an unsupported type to text', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createThing({ name: 'S', type: 'appliance', state: 'dirty' });

      expect(mockAxiosInstance.post.mock.calls[0][1].type).toBe('text');
    });

    it('defaults the type when none is given', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createThing({ name: 'S' });

      expect(mockAxiosInstance.post.mock.calls[0][1]).toEqual({
        name: 'S',
        type: 'text',
        state: '',
      });
    });
  });

  describe('things read and update paths', () => {
    it('finds a thing by scanning the list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [{ id: 4, name: 'T' }] } });

      expect(await client.getThing(4)).toEqual({ id: 4, name: 'T' });
    });

    it('reports a thing that does not exist', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [] } });
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      await expect(client.getThing(4)).rejects.toThrow(/not found/);
    });

    it('merges the existing thing on a partial update', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: [{ id: 4, name: 'Old', type: 'number', state: '5' }] },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateThing({ id: 4, name: 'New' });

      expect(mockAxiosInstance.put.mock.calls[0][1]).toEqual({
        id: 4,
        name: 'New',
        type: 'number',
        state: '5',
      });
    });

    it('still writes when the pre-read fails', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [] } });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateThing({ id: 4, name: 'New' });

      expect(mockAxiosInstance.put.mock.calls[0][1].name).toBe('New');
    });

    it('sends the thing state as a query parameter', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateThingState(4, 'full');

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/things/4/state', null, {
        params: { value: 'full' },
      });
    });
  });

  describe('completeChore payload', () => {
    it('sends an empty body when given nothing but the id', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: {} } });

      await client.completeChore({ choreId: 1 });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/chores/1/do', {});
    });

    it('normalizes completedTime and forwards completedBy', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: {} } });

      await client.completeChore({
        choreId: 1,
        notes: 'done',
        completedTime: '2026-08-30',
        completedBy: 3,
      });

      expect(mockAxiosInstance.post.mock.calls[0][1]).toEqual({
        notes: 'done',
        completedTime: '2026-08-30T18:00:00.000Z',
        completedBy: 3,
      });
    });
  });

  describe('interval frequency metadata', () => {
    it('defaults the unit for an interval chore on create', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createChore({ name: 'C', frequencyType: 'interval' });

      expect(mockAxiosInstance.post.mock.calls[0][1].frequencyMetadata).toEqual({ unit: 'days' });
    });

    it('keeps caller-supplied metadata untouched', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createChore({
        name: 'C',
        frequencyType: 'interval',
        frequencyMetadata: { unit: 'weeks' },
      });

      expect(mockAxiosInstance.post.mock.calls[0][1].frequencyMetadata).toEqual({ unit: 'weeks' });
    });

    it('carries existing metadata forward on update', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 5, name: 'C', frequencyMetadata: { unit: 'months' } } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateChore({ id: 5 });

      expect(mockAxiosInstance.put.mock.calls[0][1].frequencyMetadata).toEqual({ unit: 'months' });
    });

    it('supplies the interval default on update when nothing exists', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 5, name: 'C', frequencyMetadata: null } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateChore({ id: 5, frequencyType: 'interval' });

      expect(mockAxiosInstance.put.mock.calls[0][1].frequencyMetadata).toEqual({ unit: 'days' });
    });
  });

  describe('completionWindow and requireApproval', () => {
    it('forwards both on create', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createChore({ name: 'C', completionWindow: 3600, requireApproval: true });

      const sent = mockAxiosInstance.post.mock.calls[0][1];
      expect(sent.completionWindow).toBe(3600);
      expect(sent.requireApproval).toBe(true);
    });

    it('preserves both on a partial update', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 5, name: 'C', completionWindow: 7200, requireApproval: true } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateChore({ id: 5 });

      const sent = mockAxiosInstance.put.mock.calls[0][1];
      expect(sent.completionWindow).toBe(7200);
      expect(sent.requireApproval).toBe(true);
    });
  });
});
