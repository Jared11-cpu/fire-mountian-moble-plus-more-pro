import type { JournalEntry, SmartRoute } from '../types/route';

const DB = 'chuyou-journal';
const STORE = 'photos';
const META = 'chuyou-journal-entries';
const ROUTE_META = 'chuyou-last-smart-route';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePhoto(file: Blob) {
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function compressPhoto(file: File, onProgress?: (progress: number) => void): Promise<Blob> {
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} 超过 10MB 原图上限。`);
  onProgress?.(10);
  const bitmap = await createImageBitmap(file);
  onProgress?.(35);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片压缩画布。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  onProgress?.(70);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
  if (!blob) throw new Error('图片压缩失败。');
  onProgress?.(100);
  return blob;
}

export async function loadPhoto(id: string) {
  const db = await openDb();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function deletePhoto(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function readEntries(): JournalEntry[] {
  try { return JSON.parse(localStorage.getItem(META) ?? '[]'); } catch { return []; }
}

export function writeEntries(entries: JournalEntry[]) {
  localStorage.setItem(META, JSON.stringify(entries));
  window.dispatchEvent(new Event('journal-change'));
}

export function readLastRoute(): SmartRoute | null {
  try { return JSON.parse(localStorage.getItem(ROUTE_META) ?? 'null'); } catch { return null; }
}

export function writeLastRoute(route: SmartRoute) {
  localStorage.setItem(ROUTE_META, JSON.stringify(route));
}

export async function clearJournal(entries: JournalEntry[]) {
  await Promise.all(entries.flatMap((entry) => entry.photoIds).map(deletePhoto));
  writeEntries([]);
}

// ---- 本机备份与恢复：手账只存在浏览器里（localStorage + IndexedDB），清缓存会丢失，所以提供导出/导入文件。 ----

export const JOURNAL_BACKUP_VERSION = 1;
export type JournalBackup = {
  app: 'chuyou-journal';
  version: number;
  exportedAt: string;
  entries: JournalEntry[];
  photos: Record<string, string>;
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('备份文件里的照片格式不正确。');
  const bytes = match[2] ? Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' });
}

export async function exportJournalBackup(entries: JournalEntry[]): Promise<JournalBackup> {
  const photos: Record<string, string> = {};
  for (const id of new Set(entries.flatMap((entry) => entry.photoIds))) {
    const blob = await loadPhoto(id);
    if (blob) photos[id] = await blobToDataUrl(blob);
  }
  return { app: 'chuyou-journal', version: JOURNAL_BACKUP_VERSION, exportedAt: new Date().toISOString(), entries, photos };
}

function isEntry(value: unknown): value is JournalEntry {
  const entry = value as JournalEntry;
  return Boolean(entry) && typeof entry.id === 'string' && typeof entry.pointId === 'string' && typeof entry.pointName === 'string'
    && Number.isFinite(entry.day) && Array.isArray(entry.photoIds) && entry.photoIds.every((id) => typeof id === 'string');
}

export function parseJournalBackup(text: string): JournalBackup {
  let value: any;
  try { value = JSON.parse(text); } catch { throw new Error('备份文件不是有效的 JSON，未做任何修改。'); }
  if (value?.app !== 'chuyou-journal' || !Array.isArray(value.entries)) throw new Error('这不是楚游手账备份文件，未做任何修改。');
  if (value.version > JOURNAL_BACKUP_VERSION) throw new Error('备份文件来自更新的版本，请先升级页面后再导入。');
  if (!value.entries.every(isEntry)) throw new Error('备份文件中有损坏的记录，未做任何修改。');
  const photos = value.photos && typeof value.photos === 'object' ? value.photos : {};
  return { app: 'chuyou-journal', version: Number(value.version) || 1, exportedAt: String(value.exportedAt ?? ''), entries: value.entries, photos };
}

// 合并导入：同 id 的记录保留本机现有版本，不覆盖；缺失照片的记录如实报告，不假装恢复成功。
// 记录本身由调用方写回应用状态（TripProvider 持久化），这里只负责还原照片并返回合并结果。
export async function importJournalBackup(backup: JournalBackup, current: JournalEntry[]) {
  const existingIds = new Set(current.map((entry) => entry.id));
  const incoming = backup.entries.filter((entry) => !existingIds.has(entry.id));
  let restoredPhotos = 0;
  let missingPhotos = 0;
  for (const entry of incoming) {
    for (const id of entry.photoIds) {
      const dataUrl = backup.photos[id];
      if (!dataUrl) { missingPhotos += 1; continue; }
      if (await loadPhoto(id)) continue;
      await putPhotoWithId(id, dataUrlToBlob(dataUrl));
      restoredPhotos += 1;
    }
  }
  const merged = [...current, ...incoming];
  return { entries: merged, added: incoming.length, skipped: backup.entries.length - incoming.length, restoredPhotos, missingPhotos };
}

async function putPhotoWithId(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
