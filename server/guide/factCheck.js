// 商家文案事实校验：模型输出里出现的地点、价格、电话、门票与营业时间，必须能在高德核实过的 facts 中找到依据；
// 找不到依据的句子直接移除并记录原因，不把模型臆造的内容包装成"已核实"。

const PLACE_SUFFIX = '旅游区|风景区|景区|公园|博物馆|纪念馆|古城|古镇|老街|步行街|广场|大坝|餐厅|酒家|饭店|菜馆|面馆';
const PLACE_PATTERN = new RegExp(`([\\u4e00-\\u9fa5A-Za-z0-9·]{0,10}?)(${PLACE_SUFFIX})`, 'g');
// 地点名前常见的动词与泛化修饰词，剥掉后若不剩名称，说明只是泛称（如"周边特色餐厅"）。
const LEADING_FILLER = /^(?:前往|出发去|去往|去|到达|到|逛逛|逛|游览|打卡|参观|漫步|在|从|和|与|及|再|然后|午餐|晚餐|早餐|附近的|附近|周边的|周边|当地的|当地|本地的|本地|特色|城市|江边|湖边|小|的)/;
const PRICE_PATTERN = /(\d{1,5}(?:\.\d+)?)\s*(?:元|块)/g;
const YEN_PATTERN = /[￥¥]\s*(\d{1,5}(?:\.\d+)?)/g;
const PHONE_PATTERN = /(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8}|400-?\d{3}-?\d{4})/;
const UNSUPPORTED_FACT_PATTERN = /门票|票价|营业时间|开放时间|开门|关门/;
// 不带数字也属于门票/开放时间断言（生产实测模型会写"24小时开放，免费入园"），高德没有这类事实，一律移除。
const UNSUPPORTED_CLAIM_PATTERN = /免费入园|免费开放|免票|全天开放|小时开放|全年无休|无需预约/;
const PLACEHOLDER = '§';

export function verifyBusinessCopy(content, facts) {
  const places = [...(facts.spots || []), ...(facts.restaurants || [])];
  const knownNames = nameVariants([facts.name, ...places.map((item) => item.name)]);
  const knownPrices = new Set(places.map((item) => Number(item.averageCost)).filter((value) => Number.isFinite(value) && value > 0));
  const knownHours = places.map((item) => String(item.openingHours || '').trim()).filter(Boolean);
  const removed = [];

  const check = (field, text) => {
    const reason = unsupportedReason(text, knownNames, knownPrices, knownHours);
    if (reason) removed.push({ field, text: String(text).slice(0, 120), reason });
    return !reason;
  };
  const filterLines = (field, lines) => lines.filter((line) => check(field, line));
  const filterText = (field, text) => splitSentences(text).filter((sentence) => check(field, sentence)).join('').trim();

  return {
    content: {
      route: filterLines('route', content.route),
      welcome: filterText('welcome', content.welcome),
      reminders: filterLines('reminders', content.reminders),
      food: filterLines('food', content.food),
      videoScript: filterLines('videoScript', content.videoScript),
      redbook: filterText('redbook', content.redbook),
      replies: filterLines('replies', content.replies),
    },
    removed,
  };
}

function unsupportedReason(text, knownNames, knownPrices, knownHours) {
  const value = String(text || '');
  if (PHONE_PATTERN.test(value)) return '包含未核实的电话号码';
  if (UNSUPPORTED_CLAIM_PATTERN.test(value)) return '包含未核实的门票或开放时间说法';
  if (UNSUPPORTED_FACT_PATTERN.test(value) && /\d/.test(value) && !knownHours.some((hours) => value.includes(hours))) return '包含未核实的门票或营业时间';
  for (const price of extractPrices(value)) {
    if (!knownPrices.has(price)) return `价格 ${price} 元不在高德返回的人均消费中`;
  }
  const unknown = unknownPlaces(value, knownNames);
  if (unknown.length) return `地点「${unknown[0]}」未经高德核实`;
  return null;
}

function extractPrices(text) {
  const prices = new Set();
  for (const pattern of [PRICE_PATTERN, YEN_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) prices.add(Number(match[1]));
  }
  return [...prices].filter((value) => Number.isFinite(value));
}

// 先把已核实名称（含去掉"旅游区"、分店括号后的简称）替换掉，剩下仍带地点后缀且有具体名称的片段即为未核实地点。
function unknownPlaces(text, knownNames) {
  let masked = text;
  for (const name of knownNames) masked = masked.split(name).join(PLACEHOLDER);
  PLACE_PATTERN.lastIndex = 0;
  const unknown = [];
  for (const match of masked.matchAll(PLACE_PATTERN)) {
    let prefix = match[1];
    let previous;
    do { previous = prefix; prefix = prefix.replace(LEADING_FILLER, ''); } while (prefix && prefix !== previous);
    if (prefix.length >= 2) unknown.push(`${prefix}${match[2]}`);
  }
  return unknown;
}

function nameVariants(names) {
  const variants = new Set();
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    variants.add(name);
    const withoutBranch = name.replace(/[（(][^）)]*[）)]$/, '').trim();
    if (withoutBranch.length >= 2) variants.add(withoutBranch);
    const core = withoutBranch.replace(/(?:旅游区|风景区|景区)$/, '').trim();
    if (core.length >= 2) variants.add(core);
  }
  // 长名称优先替换，避免简称先命中后把全称拆散。
  return [...variants].sort((left, right) => right.length - left.length);
}

function splitSentences(text) {
  return String(text || '').match(/[^。！？!?\n]+[。！？!?\n]?/g) ?? [];
}
