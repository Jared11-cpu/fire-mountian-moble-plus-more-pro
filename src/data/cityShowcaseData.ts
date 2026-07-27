import type { Interest } from '../domain/trip';
import { cities, type CityName } from './mockData';

export type CityShowcaseTag = {
  label: string;
  interest: Interest;
};

export type CityShowcaseMedia = {
  id: string;
  imageUrl: string;
  mobileImageUrl: string;
  objectPosition: string;
  mobileObjectPosition?: string;
  motion: {
    fromX: string;
    fromY: string;
    toX: string;
    toY: string;
  };
  imageCredit: {
    author: string;
    sourceUrl?: string;
  };
};

export type CityShowcaseItem = Omit<CityShowcaseMedia, 'id'> & {
  city: CityName;
  englishName: string;
  theme: string;
  eyebrow: string;
  description: string;
  tags: CityShowcaseTag[];
  mediaPool?: CityShowcaseMedia[];
};

const cityByName = new Map(cities.map((city) => [city.name, city]));

const localShowcaseAssets: Partial<Record<CityName, { desktop: string; mobile: string }>> = {
  恩施: { desktop: 'enshi-desktop.jpg', mobile: 'enshi-mobile.jpg' },
  荆州: { desktop: 'jingzhou-desktop.jpg', mobile: 'jingzhou-mobile.jpg' },
  襄阳: { desktop: 'xiangyang-zhaoming-platform.png', mobile: 'xiangyang-zhaoming-platform.png' },
  黄石: { desktop: 'huangshi-desktop.jpg', mobile: 'huangshi-mobile.jpg' },
};

function cityImage(city: CityName, width: number = 1920) {
  const source = cityByName.get(city)?.imageUrl ?? '';
  return source.includes('commons.wikimedia.org')
    ? source.replace(/([?&]width=)\d+/i, `$1${width}`)
    : source;
}

function item(
  city: CityName,
  englishName: string,
  theme: string,
  eyebrow: string,
  description: string,
  tags: CityShowcaseTag[],
  objectPosition = 'center',
  motion: CityShowcaseItem['motion'] = { fromX: '-0.7%', fromY: '0%', toX: '0.7%', toY: '0%' },
  mediaPool?: CityShowcaseMedia[],
): CityShowcaseItem {
  const source = cityByName.get(city)!;
  const localAsset = localShowcaseAssets[city];
  return {
    city,
    englishName,
    theme,
    eyebrow,
    description,
    imageUrl: localAsset ? `${import.meta.env.BASE_URL}cities/${localAsset.desktop}` : cityImage(city, 1920),
    mobileImageUrl: localAsset ? `${import.meta.env.BASE_URL}cities/${localAsset.mobile}` : cityImage(city, 960),
    objectPosition,
    mobileObjectPosition: city === '襄阳' ? '49% center' : objectPosition,
    motion,
    tags,
    imageCredit: city === '襄阳' ? { author: '襄阳城市影像 · 用户提供素材' } : source.imageCredit,
    mediaPool,
  };
}

const localWuhanMedia = (
  id: string,
  fileName: string,
  objectPosition: string,
  mobileObjectPosition: string,
  motion: CityShowcaseMedia['motion'],
): CityShowcaseMedia => ({
  id,
  imageUrl: `${import.meta.env.BASE_URL}cities/wuhan/${fileName}`,
  mobileImageUrl: `${import.meta.env.BASE_URL}cities/wuhan/${fileName}`,
  objectPosition,
  mobileObjectPosition,
  motion,
  imageCredit: { author: '武汉城市影像 · 用户提供素材' },
});

export const wuhanShowcaseMedia: CityShowcaseMedia[] = [
  localWuhanMedia('river-bridge-night', 'yangtze-river-bridge-night-clean.png', 'center 55%', '60% 52%', { fromX: '-.6%', fromY: '.15%', toX: '.35%', toY: '-.15%' }),
  localWuhanMedia('river-skyline', 'wuhan-river-skyline-clean.png', 'center 51%', '42% center', { fromX: '-.45%', fromY: '.15%', toX: '.3%', toY: '-.12%' }),
  localWuhanMedia('lakes-skyline', 'wuhan-lakes-skyline-clean.png', 'center 49%', '68% center', { fromX: '.4%', fromY: '.12%', toX: '-.3%', toY: '-.12%' }),
];

export const cityShowcaseItems: CityShowcaseItem[] = [
  item('宜昌', 'YICHANG', 'RIVER & GORGE', 'THE GREAT RIVER, REFRAMED', '长江在峡谷与大坝之间重新铺开。循水而行，看山河尺度，也看宜昌沿岸真实而松弛的生活。', [
    { label: '三峡山水', interest: '自然风光' },
    { label: '江岸摄影', interest: '拍照' },
    { label: '峡江风味', interest: '美食' },
  ], 'center 48%', { fromX: '-1%', fromY: '.4%', toX: '.6%', toY: '-.25%' }),
  item('武汉', 'WUHAN', 'CITY & LAKE', 'A METROPOLIS BETWEEN WATERS', '两江交汇，湖泊深入街区。武汉把近代城市记忆、大学人文与鲜活日常收进同一次漫游。', [
    { label: '江城漫步', interest: 'Citywalk' },
    { label: '城市人文', interest: '历史文化' },
    { label: '街巷味道', interest: '美食' },
  ], wuhanShowcaseMedia[0].objectPosition, wuhanShowcaseMedia[0].motion, wuhanShowcaseMedia),
  item('恩施', 'ENSHI', 'CANYON & CLOUD', 'WHERE CLOUDS ENTER THE CANYON', '峡谷切开群山，云雾沿绝壁游走。恩施适合把脚步放慢，让自然成为旅程真正的叙事者。', [
    { label: '峡谷徒步', interest: '自然风光' },
    { label: '云海影像', interest: '拍照' },
    { label: '土家文化', interest: '历史文化' },
  ], 'center 46%', { fromX: '-.45%', fromY: '.6%', toX: '.55%', toY: '-.35%' }),
  item('荆州', 'JINGZHOU', 'MEMORY OF CHU', 'THE SOUTHERN MEMORY OF CHU', '城墙、博物馆与长江故道共同保存着楚地记忆。荆州不喧哗，却让两千年的时间触手可及。', [
    { label: '楚文化', interest: '历史文化' },
    { label: '古城行走', interest: 'Citywalk' },
    { label: '城墙旅拍', interest: '拍照' },
  ], 'center 45%', { fromX: '.65%', fromY: '.35%', toX: '-.5%', toY: '-.15%' }),
  item('襄阳', 'XIANGYANG', 'RIVER & ANCIENT CITY', 'AN OLD CITY BESIDE THE HAN RIVER', '汉江绕城，古城与市井彼此相望。从城墙到旧街，襄阳保留着有温度的历史纵深。', [
    { label: '汉江古城', interest: '历史文化' },
    { label: '城中漫游', interest: 'Citywalk' },
    { label: '古风摄影', interest: '拍照' },
  ], 'center 48%', { fromX: '-.8%', fromY: '.15%', toX: '.45%', toY: '-.3%' }),
  item('黄石', 'HUANGSHI', 'INDUSTRY & LAKE', 'INDUSTRIAL TRACES, OPEN WATER', '矿冶遗迹与湖岸风景在这里并置。黄石把工业力量转化为独特、克制而少见的城市景观。', [
    { label: '工业遗产', interest: '历史文化' },
    { label: '湖岸风光', interest: '自然风光' },
    { label: '工业影像', interest: '拍照' },
  ], 'center 52%', { fromX: '.7%', fromY: '.45%', toX: '-.55%', toY: '-.25%' }),
];

export function resolveCityShowcaseItem(item: CityShowcaseItem, mediaId?: string): CityShowcaseItem & { mediaId?: string } {
  const media = item.mediaPool?.find((candidate) => candidate.id === mediaId) ?? item.mediaPool?.[0];
  return media ? { ...item, ...media, mediaId: media.id } : item;
}

export function randomWuhanShowcaseMediaId(random = Math.random) {
  return wuhanShowcaseMedia[Math.floor(random() * wuhanShowcaseMedia.length)]?.id ?? wuhanShowcaseMedia[0].id;
}

export function cityShowcaseIndex(city: CityName) {
  const index = cityShowcaseItems.findIndex((item) => item.city === city);
  return index < 0 ? 0 : index;
}

export function cityNumber(city: CityName) {
  return String(cityShowcaseIndex(city) + 1).padStart(2, '0');
}
