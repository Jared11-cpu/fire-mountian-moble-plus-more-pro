import { businessCopy } from '../ai/service.js';
import { searchPois, searchPoisAround } from '../amap/service.js';
import { assertText, httpError } from '../http.js';
import { verifyBusinessCopy } from './factCheck.js';

// 商家住客服务方案：周边景点与餐厅先由高德核实，千问只基于这些事实写文案。
export async function businessPlan(env, input) {
  const name = assertText(input.name, '商家名称', { max: 60 });
  const city = assertText(input.city, '城市', { max: 20 });
  const target = assertText(input.target || '家庭', '目标客户', { max: 20 });
  const spotNames = (Array.isArray(input.spots) ? input.spots : String(input.spots || '').split(/[，,、\n]/))
    .map((item) => String(item).trim()).filter(Boolean).slice(0, 4);
  if (!spotNames.length) throw httpError(400, '请至少填写一个周边景点');

  const lookups = await Promise.allSettled(spotNames.map(async (keywords) => {
    const result = await searchPois(env, new URLSearchParams({ city, keywords, pageSize: '5', allTypes: '1' }), 'attraction');
    // 只接受同城、名称对得上的候选：高德首条结果可能是重名的异地景点或无关地点。
    return result.items.find((item) => item.location && sameCity(item.city, city) && sameName(item.name, keywords)) ?? null;
  }));
  const spots = lookups.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  // 全部查询都失败（未配置 Key、鉴权失败、超时）时如实返回高德错误，不能误报成"景点名称找不到"。
  if (!spots.length && lookups.every((result) => result.status === 'rejected')) throw lookups[0].reason;
  if (!spots.length) throw httpError(422, `高德没有在${city}找到这些景点，请检查名称后重试`);
  const unmatchedSpots = spotNames.filter((_, index) => lookups[index].status !== 'fulfilled' || !lookups[index].value);

  const arounds = await Promise.allSettled(spots.slice(0, 2).map((spot) => searchPoisAround(env, new URLSearchParams({ location: `${spot.location.lng},${spot.location.lat}`, radius: '2000', pageSize: '8' }), 'restaurant')));
  const seen = new Set();
  const restaurants = arounds.flatMap((result) => result.status === 'fulfilled' ? result.value.items : [])
    .filter((item) => item.name && !seen.has(item.id || item.name) && seen.add(item.id || item.name))
    .slice(0, 8);

  const facts = { name, city, target, spots: spots.map(placeFacts), restaurants: restaurants.map(placeFacts) };
  const generated = await businessCopy(facts, env);
  const { content, removed } = verifyBusinessCopy(generated, facts);
  const fallback = factOnlyCopy(facts);
  const filled = Object.fromEntries(Object.entries(content).map(([key, value]) => [key, (Array.isArray(value) ? value.length : value) ? value : fallback[key]]));
  return {
    source: 'amap+qwen', generatedAt: new Date().toISOString(), facts, unmatchedSpots,
    restaurantsVerified: restaurants.length > 0,
    factCheck: { removed, filledFromFacts: Object.keys(content).filter((key) => filled[key] !== content[key]) },
    ...filled,
  };
}

// 模型输出被事实校验整段删空时，用只含已核实事实的模板补齐，避免返回空栏位或重新引入未核实内容。
function factOnlyCopy(facts) {
  const slots = ['09:00', '11:00', '14:00', '16:00'];
  const spotNames = facts.spots.map((item) => item.name);
  return {
    route: facts.spots.slice(0, 4).map((item, index) => `${slots[index]} 前往${item.name}${item.district ? `（${item.district}）` : ''}`),
    welcome: `欢迎入住${facts.name}！周边可前往${spotNames.join('、')}。`,
    reminders: ['景点开放时间与门票请以官方渠道为准。', '周边地点由高德地图检索，出发前请再次确认。'],
    food: facts.restaurants.length
      ? facts.restaurants.slice(0, 4).map((item) => `${item.name}${item.averageCost ? `，人均约 ${item.averageCost} 元` : ''}${item.district ? `（${item.district}）` : ''}`)
      : ['周边餐厅暂未查询到，请在地图中搜索附近餐饮。'],
    videoScript: [`镜头 1：${facts.name} 外景`, ...spotNames.slice(0, 3).map((spotName, index) => `镜头 ${index + 2}：${spotName}`)],
    redbook: `${facts.city}｜住在${facts.name}，周边就是${spotNames.join('、')}。`,
    replies: ['您好，周边景点的开放时间与票价请以官方渠道为准，我们可以帮您查询路线。'],
  };
}

function sameCity(poiCity, city) {
  const text = String(poiCity || '').trim();
  return !text || text.includes(city) || city.includes(text.replace(/市$/, ''));
}

function sameName(poiName, keyword) {
  const normalize = (value) => String(value || '').replace(/[（(][^）)]*[）)]/g, '').replace(/(?:旅游区|风景区|景区|\s)/g, '');
  const left = normalize(poiName);
  const right = normalize(keyword);
  return Boolean(left && right) && (left.includes(right) || right.includes(left));
}

function placeFacts(item) {
  return {
    id: item.id || null, name: item.name, district: item.district || null, address: item.address || null,
    averageCost: item.averageCost ?? null, rating: item.rating ?? null, openingHours: item.openingHours ?? null,
  };
}
