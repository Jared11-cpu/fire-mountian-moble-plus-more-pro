import { assertText, fetchJson, httpError } from '../http.js';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export function aiConfigured(env) {
  return Boolean(env.DASHSCOPE_API_KEY);
}

export async function extractTravelRequest(userText, env) {
  const text = assertText(userText, '旅行需求', { max: 3000 });
  const schema = {
    city: 'string|null', startDate: 'YYYY-MM-DD|null', days: 'number|null', people: 'number|null',
    budgetPerPerson: 'number|null', interests: 'string[]', dietaryNeeds: 'string[]', mobility: 'string|null',
    transportPreference: 'string|null', hotelPreference: 'string|null', departureDeadline: 'string|null',
    requestedPlaces: 'string[]', avoidPlaces: 'string[]', travelStyle: 'string|null',
  };
  const result = await qwenJson(env, {
    model: env.AI_EXTRACT_MODEL || 'qwen-flash',
    temperature: 0.1,
    system: `你是旅游需求结构化提取器。必须只返回合法 JSON，不得编造用户未提供的信息；不确定字段用 null，数组缺省为空数组。requestedPlaces 必须逐项保留用户明确想去、想看、参观、经过或必去的地点名称，不能用泛化兴趣替代；即使存在口语或轻微错别字，也应提取可用于地图检索的核心专名（例如文本提到“三峡”就保留“三峡”）。avoidPlaces 只提取明确要求避开的地点。字段约束：${JSON.stringify(schema)}。`,
    user: text,
  });
  return mergeDeterministicTravelFacts(validateTravelRequest(result), text);
}

function mergeDeterministicTravelFacts(ai, text) {
  const supportedCities = ['宜昌', '武汉', '恩施', '荆州', '襄阳', '黄石'];
  const explicitCity = supportedCities.find((city) => text.includes(city)) || null;
  const dayMatch = text.match(/([一二两三四五六七八九十\d]+)天(?:[一二两三四五六七八九十\d]+夜)?/) ?? text.match(/([一二两三四五六七八九十\d]+)日游/);
  const budgetMatch = text.match(/(?:预算|人均)\s*(\d{2,7})(?:\s*(?:元|块))?/) ?? text.match(/(\d{2,7})\s*块/);
  const interestLexicon = [
    ['自然风光', ['自然风光', '峡谷', '山水', '云海', '徒步']],
    ['拍照', ['拍照', '摄影', '旅拍', '出片']],
    ['美食', ['美食', '小吃', '餐厅', '咖啡', '好吃']],
    ['历史文化', ['历史文化', '历史', '博物馆', '古城', '文化']],
    ['Citywalk', ['Citywalk', 'citywalk', '城市漫步']],
  ];
  const deterministicInterests = interestLexicon.filter(([, words]) => words.some((word) => text.includes(word))).map(([interest]) => interest);
  const dietaryNeeds = [
    ...ai.dietaryNeeds,
    ...(/不吃辣|不要辣|忌辣/u.test(text) ? ['不吃辣'] : []),
    ...(/素食|吃素/u.test(text) ? ['素食'] : []),
  ];
  return {
    ...ai,
    city: explicitCity || ai.city,
    days: dayMatch ? Math.min(60, Math.max(1, chineseNumber(dayMatch[1]))) : ai.days,
    budgetPerPerson: budgetMatch ? Number(budgetMatch[1]) : ai.budgetPerPerson,
    interests: [...new Set([...ai.interests, ...deterministicInterests])],
    dietaryNeeds: [...new Set(dietaryNeeds)],
  };
}

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (digits[tens] || 1) * 10 + (digits[ones] || 0);
  }
  return digits[value] || 1;
}

export async function rankCandidates(input, env) {
  if (!Array.isArray(input.candidates) || input.candidates.length < 1 || input.candidates.length > 50) throw httpError(400, 'candidates 必须包含 1-50 个真实候选地点');
  const candidates = input.candidates.map(sanitizeCandidate);
  const result = await qwenJson(env, {
    model: env.AI_RECOMMEND_MODEL || 'qwen-plus',
    temperature: 0.2,
    system: '你是旅游推荐排序器。必须只返回 JSON。只能选择给定 candidates 中的 id；不得修改地点名称、价格、坐标、营业时间、评分等事实。数据不足时 status 必须为 data_insufficient。返回 {"status":"ok|data_insufficient","ranked":[{"id":"候选id","reason":"理由","fitScore":0到100}],"warnings":["注意事项"]}。',
    user: JSON.stringify({ userPreferences: input.userPreferences || {}, candidates }),
  });
  return validateRanking(result, new Set(candidates.map((item) => item.id)));
}

export async function transportAdvice(input, env) {
  if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 12) throw httpError(400, 'options 必须包含 1-12 个真实交通方案');
  const options = input.options.map((option, index) => ({ id: String(option.id ?? index), ...copyFacts(option) }));
  const result = await qwenJson(env, {
    model: env.AI_RECOMMEND_MODEL || 'qwen-plus', temperature: 0.15,
    system: '你是交通方案解释器。必须只返回 JSON，只能从 options 中选择 id，不得计算或修改线路、时间、票价、站点、路况和车辆位置。需要结合 userPreference 分别解释每一种交通方式的优势和取舍。返回 {"recommendedOptionId":"id","reason":"结合当前偏好的推荐理由","cautions":["注意事项"],"optionAnalyses":[{"id":"方案id","summary":"该方案在当前偏好下的事实性分析"}]}。',
    user: JSON.stringify({ options, userPreference: input.userPreference || '', specialNeeds: input.specialNeeds || [] }),
  });
  if (!options.some((item) => item.id === String(result.recommendedOptionId))) throw httpError(502, 'AI 返回了不存在的交通方案');
  const optionIds = new Set(options.map((item) => item.id));
  const optionAnalyses = (Array.isArray(result.optionAnalyses) ? result.optionAnalyses : []).filter((item) => item && optionIds.has(String(item.id)) && String(item.summary || '').trim()).slice(0, options.length).map((item) => ({ id: String(item.id), summary: assertText(item.summary, '方案分析', { max: 500 }) }));
  return { recommendedOptionId: String(result.recommendedOptionId), reason: assertText(result.reason, '推荐理由', { max: 800 }), cautions: stringArray(result.cautions, 10), optionAnalyses };
}

export async function customAnalysis(input, env) {
  const question = assertText(input.question || input.prompt, '分析问题', { max: 3000 });
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const result = await qwenJson(env, {
    model: env.AI_RECOMMEND_MODEL || 'qwen-plus', temperature: 0.25,
    system: '你是中文旅行分析助手。必须只返回 JSON {"analysis":"...","assumptions":[],"dataGaps":[],"suggestedActions":[]}。只能依据用户问题和 context 分析。禁止编造地点、价格、营业时间、票价、路线、路况或车辆位置；缺少事实时明确写入 dataGaps。',
    user: JSON.stringify({ question, context: copyFacts(context) }),
  });
  return {
    analysis: assertText(result.analysis, '分析结果', { max: 6000 }),
    assumptions: stringArray(result.assumptions, 20), dataGaps: stringArray(result.dataGaps, 20), suggestedActions: stringArray(result.suggestedActions, 20),
  };
}

async function qwenJson(env, { model, system, user, temperature }) {
  if (!env.DASHSCOPE_API_KEY) throw httpError(503, '尚未配置通义千问 API Key');
  const workspaceBaseUrl = env.DASHSCOPE_WORKSPACE_ID ? `https://${env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` : '';
  const baseUrl = String(env.AI_BASE_URL || workspaceBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const data = await fetchJson(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  }, { timeoutMs: 25_000, service: '通义千问' });
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw httpError(502, '通义千问没有返回有效内容');
  try { return JSON.parse(content); }
  catch { throw httpError(502, '通义千问没有返回合法 JSON'); }
}

function validateTravelRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(502, 'AI 需求结构不正确');
  return {
    city: nullableString(value.city), startDate: dateOrNull(value.startDate), days: nullableNumber(value.days, 1, 60), people: nullableNumber(value.people, 1, 100),
    budgetPerPerson: nullableNumber(value.budgetPerPerson, 0, 10_000_000), interests: stringArray(value.interests, 30), dietaryNeeds: stringArray(value.dietaryNeeds, 30),
    mobility: nullableString(value.mobility), transportPreference: nullableString(value.transportPreference), hotelPreference: nullableString(value.hotelPreference), departureDeadline: nullableString(value.departureDeadline),
    requestedPlaces: stringArray(value.requestedPlaces, 10), avoidPlaces: stringArray(value.avoidPlaces, 10), travelStyle: nullableString(value.travelStyle),
  };
}

export async function scheduleItinerary(input, env) {
  if (!Array.isArray(input.points) || input.points.length < 1 || input.points.length > 50) throw httpError(400, 'points 必须包含 1-50 个行程点');
  const points = input.points.map((point, index) => ({
    id: assertText(point.id, `第 ${index + 1} 个点位 id`, { max: 200 }),
    name: assertText(point.name, `第 ${index + 1} 个点位名称`, { max: 200 }),
    day: Math.max(1, Math.min(15, Math.round(Number(point.day) || 1))),
    stayMinutes: Math.max(10, Math.min(480, Math.round(Number(point.stayMinutes) || 60))),
    travelMinutesToNext: Math.max(0, Math.min(720, Math.round(Number(point.travelMinutesToNext) || 0))),
    openingHours: nullableString(point.openingHours),
  }));
  const result = await qwenJson(env, {
    model: env.AI_RECOMMEND_MODEL || 'qwen-plus', temperature: 0.1,
    system: '你是湖北旅行安全排程助手。必须只返回 JSON：{"departureTime":"HH:mm","items":[{"id":"原始id","day":1,"arrivalTime":"HH:mm","reason":"简短理由"}],"safetyNotes":[]}。只能使用输入 points 中的 id、day、停留时长、交通时长和已提供的 openingHours，不得编造营业时间或路线。每天必须独立排程，所有到达时间必须在 07:30-21:30，严禁 22:00-次日07:29 的夜间赶路；同一天必须严格按输入顺序递增，并为上一站停留和交通预留足够时间。老人、儿童或行动不便应优先安排更早结束。必须为每个输入点返回且只返回一项。',
    user: JSON.stringify({ city: input.city || '', days: input.days || 1, travelerType: input.travelerType || '', specialNeeds: input.specialNeeds || [], preferredDepartureTime: input.departureTime || '08:30', points }),
  });
  return validateSchedule(result, points);
}

function sanitizeCandidate(item, index) {
  if (!item || typeof item !== 'object') throw httpError(400, `第 ${index + 1} 个候选地点无效`);
  const id = assertText(item.id, '候选地点 id', { max: 200 });
  return { id, ...copyFacts(item) };
}

function validateRanking(value, ids) {
  if (!value || !['ok', 'data_insufficient'].includes(value.status)) throw httpError(502, 'AI 排序结果状态无效');
  const seen = new Set();
  const ranked = (Array.isArray(value.ranked) ? value.ranked : []).map((item) => {
    const id = String(item.id || '');
    if (!ids.has(id) || seen.has(id)) throw httpError(502, 'AI 排序结果引用了无效候选地点');
    seen.add(id);
    return { id, reason: assertText(item.reason, '推荐理由', { max: 800 }), fitScore: Math.max(0, Math.min(100, Number(item.fitScore) || 0)) };
  });
  return { status: value.status, ranked, warnings: stringArray(value.warnings, 20) };
}

function validateSchedule(value, points) {
  const departureTime = safeTime(value?.departureTime, 'AI 建议出发时间', 7 * 60 + 15, 10 * 60 + 30);
  if (!Array.isArray(value?.items) || value.items.length !== points.length) throw httpError(502, 'AI 排程没有覆盖全部行程点');
  const pointById = new Map(points.map((point) => [point.id, point]));
  const seen = new Set();
  const items = value.items.map((item) => {
    const id = String(item?.id || '');
    const point = pointById.get(id);
    if (!point || seen.has(id) || Number(item.day) !== point.day) throw httpError(502, 'AI 排程引用了无效点位或日期');
    seen.add(id);
    return { id, day: point.day, arrivalTime: safeTime(item.arrivalTime, `${point.name}到达时间`, 7 * 60 + 30, 21 * 60 + 30), reason: assertText(item.reason || '结合安全时段、停留与交通耗时安排。', '排程理由', { max: 300 }) };
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const current = byId.get(point.id);
    const nextPoint = points[index + 1];
    const next = nextPoint ? byId.get(nextPoint.id) : undefined;
    if (!current || !next || nextPoint.day !== point.day) continue;
    const required = timeMinutes(current.arrivalTime) + point.stayMinutes + point.travelMinutesToNext;
    if (timeMinutes(next.arrivalTime) < required) throw httpError(502, 'AI 排程未预留足够的停留或交通时间');
  }
  return { departureTime, items: points.map((point) => byId.get(point.id)), safetyNotes: stringArray(value.safetyNotes, 10) };
}

function safeTime(value, label, min, max) {
  const text = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw httpError(502, `${label}格式无效`);
  const minutes = timeMinutes(text);
  if (minutes < min || minutes > max) throw httpError(502, `${label}超出安全时段`);
  return text;
}
function timeMinutes(value) { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; }

function copyFacts(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value ?? null;
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => copyFacts(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).map(([key, item]) => [key, copyFacts(item, depth + 1)]));
  return String(value);
}
function stringArray(value, max) { return (Array.isArray(value) ? value : []).slice(0, max).map((item) => String(item).trim()).filter(Boolean); }
function nullableString(value) { const text = String(value ?? '').trim(); return text ? text.slice(0, 500) : null; }
function nullableNumber(value, min, max) { if (value === null || value === undefined || value === '') return null; const number = Number(value); return Number.isFinite(number) && number >= min && number <= max ? number : null; }
function dateOrNull(value) { const text = nullableString(value); return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
