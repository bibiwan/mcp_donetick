import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLabelTools } from '../src/tools/labels.js';

describe('Label Tools Handlers', () => {
  let server: McpServer;
  let mockClient: any;
  let registeredTools: Map<string, Function>;

  beforeEach(() => {
    registeredTools = new Map();
    server = {
      tool: vi.fn((name: string, descOrSchema: any, schemaOrHandler: any, handler?: Function) => {
        const fn = handler || schemaOrHandler;
        registeredTools.set(name, fn);
      }),
    } as any;

    mockClient = {
      listLabels: vi.fn(),
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      getChore: vi.fn(),
      updateChore: vi.fn(),
    };

    registerLabelTools(server, mockClient);
  });

  it('donetick_list_labels should list all labels and handle error', async () => {
    const handler = registeredTools.get('donetick_list_labels')!;
    mockClient.listLabels.mockResolvedValueOnce([{ id: 1, name: 'Urgent', color: '#ff0000' }]);

    const res = await handler({});
    expect(mockClient.listLabels).toHaveBeenCalled();
    expect(res.content[0].text).toContain('Labels (1)');

    mockClient.listLabels.mockRejectedValueOnce(new Error('Failed list'));
    const errRes = await handler({});
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list labels');
  });

  it('donetick_create_label should create a label and handle error', async () => {
    const handler = registeredTools.get('donetick_create_label')!;
    mockClient.createLabel.mockResolvedValueOnce({ id: 2, name: 'House', color: 'blue' });

    const res = await handler({ name: 'House', color: 'blue' });
    expect(mockClient.createLabel).toHaveBeenCalledWith({ name: 'House', color: 'blue' });
    expect(res.content[0].text).toContain('Label created successfully');

    mockClient.createLabel.mockRejectedValueOnce(new Error('Duplicate'));
    const errRes = await handler({ name: 'House' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to create label');
  });

  it('donetick_update_label should update a label and handle error', async () => {
    const handler = registeredTools.get('donetick_update_label')!;
    mockClient.updateLabel.mockResolvedValueOnce({ id: 2, name: 'Home', color: 'green' });

    const res = await handler({ id: 2, name: 'Home', color: 'green' });
    expect(mockClient.updateLabel).toHaveBeenCalledWith({ id: 2, name: 'Home', color: 'green' });
    expect(res.content[0].text).toContain('Label #2 updated successfully');

    mockClient.updateLabel.mockRejectedValueOnce(new Error('Not found'));
    const errRes = await handler({ id: 99 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to update label #99');
  });

  it('donetick_delete_label should delete a label and handle error', async () => {
    const handler = registeredTools.get('donetick_delete_label')!;
    mockClient.deleteLabel.mockResolvedValueOnce({ message: 'Deleted' });

    const res = await handler({ id: 2 });
    expect(mockClient.deleteLabel).toHaveBeenCalledWith(2);
    expect(res.content[0].text).toContain('Label #2 deleted successfully');

    mockClient.deleteLabel.mockRejectedValueOnce(new Error('Cannot delete'));
    const errRes = await handler({ id: 2 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to delete label #2');
  });

  it('donetick_set_chore_labels should set labels and handle error', async () => {
    const handler = registeredTools.get('donetick_set_chore_labels')!;
    mockClient.listLabels.mockResolvedValueOnce([]);
    mockClient.updateChore.mockResolvedValueOnce({ id: 5 });

    const res = await handler({ choreId: 5, labels: [1, { id: 2, name: 'Custom', color: 'red' }] });
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 5,
      labelsV2: [
        { id: 1, labelId: 1, LabelID: 1, name: '', color: '' },
        { id: 2, labelId: 2, LabelID: 2, name: 'Custom', color: 'red' },
      ],
    });
    expect(res.content[0].text).toContain('Labels updated for Chore #5');

    mockClient.listLabels.mockRejectedValueOnce(new Error('Failed list'));
    mockClient.updateChore.mockRejectedValueOnce(new Error('Failed labels'));
    const errRes = await handler({ choreId: 5, labels: [] });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to set labels');
  });

  it('donetick_add_chore_label should add a label by ID or by name and handle error', async () => {
    const handler = registeredTools.get('donetick_add_chore_label')!;
    mockClient.listLabels.mockResolvedValue([{ id: 3, name: 'BrandNew' }]);
    mockClient.getChore.mockResolvedValue({ id: 5, labelsV2: [{ id: 1, labelId: 1, LabelID: 1, name: 'Old' }] });
    mockClient.updateChore.mockResolvedValue({ id: 5 });

    // By ID
    const resId = await handler({ choreId: 5, labelId: 2, name: 'New' });
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 5,
      labelsV2: [
        { id: 1, labelId: 1, LabelID: 1, name: 'Old', color: undefined },
        { id: 2, labelId: 2, LabelID: 2, name: 'New' },
      ],
    });
    expect(resId.content[0].text).toContain('Label added to Chore #5');

    // By name
    const resName = await handler({ choreId: 5, name: 'BrandNew' });
    expect(resName.content[0].text).toContain('Label added to Chore #5');

    // Neither / Unknown
    mockClient.listLabels.mockResolvedValueOnce([]);
    const resMissing = await handler({ choreId: 5, name: 'NonExistent' });
    expect(resMissing.isError).toBe(true);

    mockClient.getChore.mockRejectedValueOnce(new Error('Chore 5 not found'));
    const errRes = await handler({ choreId: 5, labelId: 2 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to add label');
  });
});
