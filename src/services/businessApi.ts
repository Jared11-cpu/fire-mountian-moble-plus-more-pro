import type { BusinessInput, BusinessPlan } from '../utils/aiGenerator';

export type AiBusinessPlan = BusinessPlan & { unmatchedSpots: string[]; generatedAt: string };

export async function requestBusinessPlan(input: BusinessInput & { city: string }): Promise<AiBusinessPlan> {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  const response = await fetch(`${base}/api/business/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
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
  };
}
