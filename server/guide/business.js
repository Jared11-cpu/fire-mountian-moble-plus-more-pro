import { businessCopy } from '../ai/service.js';
import { searchPois, searchPoisAround } from '../amap/service.js';
import { assertText, httpError } from '../http.js';

// 商家住客服务方案：周边景点与餐厅先由高德核实，千问只基于这些事实写文案。
export async function businessPlan(env, input) {
  const name = assertText(input.name, '商家名称', { max: 60 });
  const city = assertText(input.city, '城市', { max: 20 });
  const target = assertText(input.target || '家庭', '目标客户', { max: 20 });
  const spotNames = (Array.isArray(input.spots) ? input.spots : String(input.spots || '').split(/[，,、\n]/))
    .map((item) => String(item).trim()).filter(Boolean).slice(0, 4);
  if (!spotNames.length) throw httpError(400, '请至少填写一个周边景点');

  const lookups = await Promise.allSettled(spotNames.map(async (keywords) => {
    const result = await searchPois(env, new URLSearchParams({ city, keywords, pageSize: '3', allTypes: '1' }), 'attraction');
    return result.items.find((item) => item.location) ?? null;
  }));
  const spots = lookups.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  if (!spots.length) throw httpError(422, `高德没有在${city}找到这些景点，请检查名称后重试`);
  const unmatchedSpots = spotNames.filter((_, index) => lookups[index].status !== 'fulfilled' || !lookups[index].value);

  let restaurants = [];
  try {
    const anchor = spots[0].location;
    const around = await searchPoisAround(env, new URLSearchParams({ location: `${anchor.lng},${anchor.lat}`, radius: '2000', pageSize: '8' }), 'restaurant');
    restaurants = around.items.filter((item) => item.name).slice(0, 8);
  } catch {
    restaurants = [];
  }

  const facts = { name, city, target, spots: spots.map(placeFacts), restaurants: restaurants.map(placeFacts) };
  const content = await businessCopy(facts, env);
  return { source: 'amap+qwen', generatedAt: new Date().toISOString(), facts, unmatchedSpots, ...content };
}

function placeFacts(item) {
  return {
    name: item.name, district: item.district || null, address: item.address || null,
    averageCost: item.averageCost ?? null, rating: item.rating ?? null, openingHours: item.openingHours ?? null,
  };
}
