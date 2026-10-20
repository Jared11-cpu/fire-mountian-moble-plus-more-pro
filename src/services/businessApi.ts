import type { BusinessInput, BusinessPlan } from '../utils/aiGenerator';

export type BusinessFactCheck = { removedCount: number; reasons: string[]; restaurantsVerified: boolean };
export type AiBusinessPlan = BusinessPlan & { unmatchedSpots: string[]; generatedAt: string; factCheck: BusinessFactCheck; copySource: 'ai' | 'facts'; copyError: string | null };

export const BUSINESS_PLAN_TIMEOUT_MS = 60_000;

export async function requestBusinessPlan(input: BusinessInput & { city: string }, signal?: AbortSignal): Promise<AiBusinessPlan> {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  // 合并调用方取消与总超时：页面切换或重复点击时中止旧请求，服务端卡住时也不会无限转圈。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('商家方案生成超时', 'TimeoutError')), BUSINESS_PLAN_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) forwardAbort(); else signal?.addEventListener('abort', forwardAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(`${base}/api/business/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') throw new Error(`商家方案生成超过 ${BUSINESS_PLAN_TIMEOUT_MS / 1000} 秒未返回`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
  let payload: any = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload?.error || `商家方案生成失败（HTTP ${response.status}）`);
  const lists = ['route', 'reminders', 'food', 'videoScript', 'replies'] as const;
  if (!payload || lists.some((key) => !Array.isArray(payload[key])) || typeof payload.welcome !== 'string' || typeof payload.redbook !== 'string') {
    throw new Error('商家方案返回格式不正确');
  }
  return {
    route: payload.route, welcome: payload.welcome, reminders: payload.reminders, food: payload.food,
    videoScript: payload.videoScript, redbook: payload.redbook, replies: payload.replies,
    unmatchedSpots: Array.isArray(payload.unmatchedSpots) ? payload.unmatchedSpots : [],
    generatedAt: String(payload.generatedAt || new Date().toISOString()),
    copySource: payload.source === 'amap-facts' ? 'facts' : 'ai',
    copyError: typeof payload.copyError === 'string' ? payload.copyError : null,
    factCheck: {
      removedCount: Array.isArray(payload.factCheck?.removed) ? payload.factCheck.removed.length : 0,
      reasons: Array.isArray(payload.factCheck?.removed) ? payload.factCheck.removed.map((item: { reason?: unknown }) => String(item?.reason ?? '')).filter(Boolean).slice(0, 5) : [],
      restaurantsVerified: payload.restaurantsVerified !== false,
    },
  };
}
