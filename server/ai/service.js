import * as qwen from './qwen.js';
import { httpError } from '../http.js';

export function aiProvider(env) {
  return String(env.AI_PROVIDER || 'qwen').trim().toLowerCase();
}

export function aiConfigured(env) {
  return aiProvider(env) === 'qwen' && qwen.aiConfigured(env);
}

export async function extractTravelRequest(text, env) {
  return provider(env).extractTravelRequest(text, env);
}

export async function rankCandidates(input, env) {
  return provider(env).rankCandidates(input, env);
}

export async function transportAdvice(input, env) {
  return provider(env).transportAdvice(input, env);
}

export async function customAnalysis(input, env) {
  return provider(env).customAnalysis(input, env);
}

export async function scheduleItinerary(input, env) {
  return provider(env).scheduleItinerary(input, env);
}

function provider(env) {
  const name = aiProvider(env);
  if (name === 'qwen') return qwen;
  throw httpError(503, `不支持的 AI 服务：${name}`);
}
