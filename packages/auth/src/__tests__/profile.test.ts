import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProfileWithFiles } from '../profile';

const steps = () => ({
  listFiles: vi.fn(async () => ['u1/a.pdf']),
  deleteRow: vi.fn(async () => {}),
  removeFiles: vi.fn<(paths: string[]) => Promise<void>>(async () => {}),
});

describe('deleteProfileWithFiles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('lists, then deletes the row, then removes the files', async () => {
    const order: string[] = [];
    const s = steps();
    s.listFiles.mockImplementation(async () => (order.push('list'), ['u1/a.pdf']));
    s.deleteRow.mockImplementation(async () => void order.push('delete'));
    s.removeFiles.mockImplementation(async () => void order.push('remove'));

    expect(await deleteProfileWithFiles(s)).toEqual({});
    expect(order).toEqual(['list', 'delete', 'remove']);
    expect(s.removeFiles).toHaveBeenCalledWith(['u1/a.pdf']);
  });

  it('keeps the files when the row delete fails', async () => {
    const s = steps();
    s.deleteRow.mockRejectedValue(new Error('row is busy'));
    expect(await deleteProfileWithFiles(s)).toEqual({ error: 'row is busy' });
    expect(s.removeFiles).not.toHaveBeenCalled();
  });

  it('keeps the row when the files cannot be listed', async () => {
    const s = steps();
    s.listFiles.mockRejectedValue(new Error('no list'));
    expect(await deleteProfileWithFiles(s)).toEqual({ error: 'no list' });
    expect(s.deleteRow).not.toHaveBeenCalled();
  });

  it('skips storage when the profile has no files', async () => {
    const s = steps();
    s.listFiles.mockResolvedValue([]);
    expect(await deleteProfileWithFiles(s)).toEqual({});
    expect(s.removeFiles).not.toHaveBeenCalled();
  });

  it('still reports success when only file removal fails, and logs it', async () => {
    const s = steps();
    s.removeFiles.mockRejectedValue(new Error('storage down'));
    expect(await deleteProfileWithFiles(s)).toEqual({});
    expect(console.error).toHaveBeenCalled();
  });
});
