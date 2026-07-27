import { describe, expect, it, vi } from 'vitest';
import { getConfiguredWuhanMediaId } from './showcaseMediaService';

describe('getConfiguredWuhanMediaId', () => {
  it('接受后端返回的有效武汉素材 id', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageId: 'river-skyline' }), { status: 200 }));
    await expect(getConfiguredWuhanMediaId(['river-skyline'], fetcher)).resolves.toBe('river-skyline');
  });

  it('接口失败或 id 未登记时安全回退', async () => {
    const invalid = vi.fn().mockResolvedValue(new Response(JSON.stringify({ imageId: 'unknown' }), { status: 200 }));
    await expect(getConfiguredWuhanMediaId(['river-skyline'], invalid)).resolves.toBeUndefined();
    await expect(getConfiguredWuhanMediaId(['river-skyline'], vi.fn().mockRejectedValue(new Error('offline')))).resolves.toBeUndefined();
  });
});
