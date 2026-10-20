// 项目未安装 @types/node，这里只在测试里取 Node 自带的 Blob。
// @ts-ignore
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePhoto, exportJournalBackup, importJournalBackup, loadPhoto, parseJournalBackup, savePhoto } from './journalStorage';
import type { JournalEntry } from '../types/route';

const entry = (id: string, photoIds: string[] = []): JournalEntry => ({ id, pointId: `p-${id}`, pointName: `景点${id}`, city: '武汉', day: 1, note: '备注', visitedAt: '2026-10-20T08:00:00.000Z', photoIds });

beforeEach(() => {
  localStorage.clear();
  // fake-indexeddb 的结构化克隆会丢掉 jsdom 的 Blob；改用 Node 自带的 Blob，等价于真实浏览器里能完整存取的 Blob。
  vi.stubGlobal('Blob', NodeBlob);
});
afterEach(() => vi.unstubAllGlobals());

describe('journal backup', () => {
  it('round-trips entries and photos after local data is wiped', async () => {
    const photoId = await savePhoto(new Blob(['hello-photo'], { type: 'image/webp' }));
    const entries = [entry('a', [photoId]), entry('b')];
    const backup = await exportJournalBackup(entries);
    expect(Object.keys(backup.photos)).toEqual([photoId]);

    await deletePhoto(photoId);
    expect(await loadPhoto(photoId)).toBeUndefined();

    const result = await importJournalBackup(parseJournalBackup(JSON.stringify(backup)), []);
    expect(result).toMatchObject({ added: 2, skipped: 0, restoredPhotos: 1, missingPhotos: 0 });
    expect(result.entries.map((item) => item.id)).toEqual(['a', 'b']);
    const restored = await loadPhoto(photoId);
    expect(restored?.type).toBe('image/webp');
    expect(restored?.size).toBe('hello-photo'.length);
  });

  it('keeps the existing local entry when the same id is imported', async () => {
    const backup = { app: 'chuyou-journal' as const, version: 1, exportedAt: '', entries: [{ ...entry('a'), note: '备份旧版' }, entry('c')], photos: {} };
    const result = await importJournalBackup(backup, [{ ...entry('a'), note: '本机最新' }]);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.entries.find((item) => item.id === 'a')?.note).toBe('本机最新');
  });

  it('reports photos that the backup does not contain instead of claiming success', async () => {
    const backup = { app: 'chuyou-journal' as const, version: 1, exportedAt: '', entries: [entry('a', ['ghost'])], photos: {} };
    const result = await importJournalBackup(backup, []);
    expect(result).toMatchObject({ added: 1, restoredPhotos: 0, missingPhotos: 1 });
  });

  it('rejects broken, foreign or newer backup files without touching local data', () => {
    expect(() => parseJournalBackup('not json')).toThrow('JSON');
    expect(() => parseJournalBackup(JSON.stringify({ hello: 1 }))).toThrow('不是楚游手账备份');
    expect(() => parseJournalBackup(JSON.stringify({ app: 'chuyou-journal', version: 99, entries: [] }))).toThrow('更新的版本');
    expect(() => parseJournalBackup(JSON.stringify({ app: 'chuyou-journal', version: 1, entries: [{ id: 1 }] }))).toThrow('损坏');
  });
});
