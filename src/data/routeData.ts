import { commonsImageUrl } from './commonsMirror';
import type { CityName } from './mockData';
import type { RoutePoint, SmartRoute } from '../types/route';

const yichangStationMedia = {
  imageUrl: commonsImageUrl('Platforms of Yichang East Railway Station.JPG'),
  imageCredit: { author: 'CaiDie', license: 'CC BY-SA 3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Platforms_of_Yichang_East_Railway_Station.JPG' },
};
const threeGorgesMedia = {
  imageUrl: commonsImageUrl('Three Gorges Dam.jpg'),
  imageCredit: { author: 'Dan Kamminga', license: 'CC BY-SA 2.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Three_Gorges_Dam.jpg' },
};
const yichangRiverMedia = {
  imageUrl: commonsImageUrl('从滨江公园看对面的雨 - panoramio.jpg'),
  imageCredit: { author: 'Danny Luo', license: 'CC BY-SA 3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:%E4%BB%8E%E6%BB%A8%E6%B1%9F%E5%85%AC%E5%9B%AD%E7%9C%8B%E5%AF%B9%E9%9D%A2%E7%9A%84%E9%9B%A8_-_panoramio.jpg' },
};

function commonsMedia(fileName: string): Pick<RoutePoint, 'imageUrl' | 'imageCredit'> {
  const normalized = fileName.replace(/ /g, '_');
  return {
    imageUrl: commonsImageUrl(fileName),
    imageCredit: {
      author: 'Wikimedia Commons',
      license: '许可见来源页',
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(normalized)}`,
    },
  };
}

const pointMedia: Record<string, Pick<RoutePoint, 'imageUrl' | 'imageCredit'>> = {
  三峡游客中心: threeGorgesMedia,
  坛子岭观景台: commonsMedia('200407-sandouping-sanxiadaba.jpg'),
  '185 平台': commonsMedia('Drei-Schluchten-Damm (Jangtse).jpg'),
  西坝不夜城: commonsMedia('Hanyi Road-Central Street 01.jpg'),
  滨江公园夜景: yichangRiverMedia,
  昙华林: commonsMedia('Tanhualin.JPG'),
  黄鹤楼红墙: commonsMedia('CN - Hubei - Wuhan - Kranichpagode.jpg'),
  粮道街: commonsMedia('Hot dry noodles.jpg'),
  江汉关: commonsMedia('20230208 Hankow Customs House.jpg'),
  汉口江滩日落: commonsMedia('汉口江滩 - Hankou River Beach Park - 2016.04 - panoramio.jpg'),
  女儿城: commonsMedia('恩施 土家女儿城 03.jpg'),
  恩施大峡谷游客中心: commonsMedia('Enshi Grand Canyon 20240725.jpg'),
  七星寨栈道: commonsMedia('恩施 恩施大峡谷七星寨.jpg'),
  云龙地缝瀑布: commonsMedia('恩施 于缆车上望向云龙地缝.jpg'),
  峡谷民宿观景台: commonsMedia('Enshi grand canyon 2025 03.jpg'),
  荆州博物馆: commonsMedia('Jingzhou Museum 2014.04.20 10-45-55.jpg'),
  宾阳楼: commonsMedia('宾阳楼 - panoramio.jpg'),
  早堂面老店: commonsMedia('Doufu wanzi et re gan mian.jpg'),
  古城墙步道: commonsMedia('荆州东门古城墙.jpg'),
  沙市洋码头: commonsMedia('2007 湖北 荆州 长江大桥 - panoramio.jpg'),
  襄阳古城北街: commonsMedia('襄阳古城 - panoramio (3).jpg'),
  古隆中: commonsMedia('湖北 襄阳古隆中景区大门 - panoramio.jpg'),
  襄阳牛肉面: commonsMedia('Xiangyang beef noodles 02.jpg'),
  唐城影视基地: commonsMedia('The Tang City 23.jpg'),
  汉江桥畔: commonsMedia('View of Changhong Bridge (Xiangyang, Hubei) passing Han river (汉江) during day.jpg'),
  黄石国家矿山公园: commonsMedia('Huaxin Cement Company former site.jpg'),
  矿冶主题展区: commonsMedia('HuBei Cement Site Museum.jpg'),
  磁湖岸线: commonsMedia('Ci Lake lights January 2009 by Matthew Shaw.jpg'),
  黄石港饼老店: commonsMedia('Wikivoyage banner of Huangshi.jpg'),
  团城山公园: commonsMedia('黄石湖与山.jpg'),
};

export const mockStartPoints: Record<CityName, RoutePoint> = {
  武汉: {
    id: 'start-wuhan',
    name: '武汉站',
    type: 'start',
    city: '武汉',
    lat: 30.6072,
    lng: 114.4244,
    time: '08:30',
    stayMinutes: 10,
    reason: '高铁到达后可直接转地铁，适合开始江城 Citywalk。',
    photoTip: '站前广场适合拍一张出发照，作为短视频开场。',
    recordTip: '记录第一句需求：今天让 AI 带我走武汉老建筑和咖啡线。',
    ...commonsMedia('20240623 Platforms of Wuhan Railway Station 01.jpg'),
  },
  宜昌: {
    id: 'start-yichang',
    name: '宜昌东站',
    type: 'start',
    city: '宜昌',
    lat: 30.6913,
    lng: 111.3706,
    time: '09:00',
    stayMinutes: 10,
    reason: '宜昌东站连接三峡游客中心和城区，适合三峡主题路线出发。',
    photoTip: '出站后拍车票、行李箱和宜昌站牌，建立旅行起点。',
    recordTip: '记录预算和偏好，突出“600 元玩三峡江景和美食”。',
    ...yichangStationMedia,
  },
  恩施: {
    id: 'start-enshi',
    name: '恩施站',
    type: 'start',
    city: '恩施',
    lat: 30.3279,
    lng: 109.485,
    time: '08:40',
    stayMinutes: 10,
    reason: '恩施站适合接驳大峡谷、女儿城和市区住宿。',
    photoTip: '用站牌和远山同框，暗示峡谷旅行开始。',
    recordTip: '记录“从车站到峡谷”的空间变化，适合短视频转场。',
    ...commonsMedia('Enshi Railway Station.JPG'),
  },
  荆州: {
    id: 'start-jingzhou',
    name: '荆州站',
    type: 'start',
    city: '荆州',
    lat: 30.3507,
    lng: 112.2416,
    time: '09:00',
    stayMinutes: 10,
    reason: '荆州站到古城和博物馆动线清晰，适合楚文化一日游。',
    photoTip: '站外拍“古城旅行开始”的 Vlog 开头。',
    recordTip: '记录从现代车站进入楚文化古城的反差。',
    ...commonsMedia('Jingzhou Railway Station 2014.04.20 07-54-17.jpg'),
  },
  襄阳: {
    id: 'start-xiangyang',
    name: '襄阳东站',
    type: 'start',
    city: '襄阳',
    lat: 32.0949,
    lng: 112.2289,
    time: '09:00',
    stayMinutes: 10,
    reason: '适合连接襄阳古城、唐城和汉江夜景。',
    photoTip: '站前拍一张古城主题出发照。',
    recordTip: '记录“汉江古城线”的第一站。',
    ...commonsMedia('襄阳东站站房外观.jpg'),
  },
  黄石: {
    id: 'start-huangshi',
    name: '黄石北站',
    type: 'start',
    city: '黄石',
    lat: 30.2232,
    lng: 115.0386,
    time: '09:00',
    stayMinutes: 10,
    reason: '适合进入矿山公园、磁湖和工业遗产路线。',
    photoTip: '站牌与城市路牌同框，做周末短途开场。',
    recordTip: '记录黄石“矿冶湖山”的第一印象。',
    ...commonsMedia('Huangshibei Railway Station.jpg'),
  },
};

const cityRoutePoints: Record<CityName, RoutePoint[]> = {
  宜昌: [
    makePoint('yc-1', '三峡游客中心', 'rest', '宜昌', 30.7076, 111.2804, '09:40', 20, '集中换乘点，适合确认门票、车次和当天路线。', '拍游客中心导览牌，作为路线说明镜头。', '记录出发前的路线总览和预算分配。'),
    makePoint('yc-2', '坛子岭观景台', 'scenic', '宜昌', 30.823, 111.009, '11:00', 80, '可俯瞰三峡大坝与长江水面，是理解大国工程的核心视角。', '用广角拍人和大坝比例，人物站画面下三分之一。', '记录“长江在这里被重新组织”的震撼感。'),
    makePoint('yc-3', '185 平台', 'photo', '宜昌', 30.826, 111.006, '13:40', 45, '近距离感受坝体尺度，适合拍工程感照片。', '拍护栏、坝体和江面延伸线，画面更有纵深。', '记录工程细节和游客表情，适合做知识型短视频。'),
    makePoint('yc-4', '西坝不夜城', 'food', '宜昌', 30.706, 111.291, '18:30', 90, '夜晚美食密集，凉虾、萝卜饺子和江边夜景可以一站完成。', '灯牌下拍小吃特写，注意保留烟火气背景。', '记录“白天看三峡，晚上吃宜昌”的反差。'),
    makePoint('yc-5', '滨江公园夜景', 'end', '宜昌', 30.704, 111.295, '20:30', 40, '适合作为一天收尾，江风、灯光和城市天际线都有记忆点。', '用慢门感拍江面灯带，人物背影更自然。', '记录一句收尾文案：长江边的风把攻略变成了体验。'),
  ],
  武汉: [
    makePoint('wh-1', '昙华林', 'photo', '武汉', 30.552, 114.302, '09:20', 70, '老街巷、坡道和小店密集，适合 Citywalk 开场。', '用街角招牌和红砖墙做人像背景。', '记录老街、咖啡、坡道的慢节奏。'),
    makePoint('wh-2', '黄鹤楼红墙', 'scenic', '武汉', 30.546, 114.306, '11:00', 80, '武汉地标与诗词记忆最强，适合文化讲解。', '红墙前拍半身或背影，避开正午硬光。', '记录课本里的黄鹤楼变成现实路线。'),
    makePoint('wh-3', '粮道街', 'food', '武汉', 30.544, 114.312, '12:40', 60, '热干面、豆皮、咖啡和小吃集中，预算友好。', '拍食物特写和排队人流，体现江城烟火气。', '记录“300 元 Citywalk 也能吃得完整”。'),
    makePoint('wh-4', '江汉关', 'scenic', '武汉', 30.584, 114.292, '15:30', 50, '近代建筑和江汉路商圈连接，适合城市历史表达。', '仰拍钟楼，人物从画面边缘走入。', '记录武汉从码头城市到现代街区的变化。'),
    makePoint('wh-5', '汉口江滩日落', 'end', '武汉', 30.597, 114.303, '17:40', 70, '江滩日落和长江大桥远景适合做情绪收尾。', '日落前 30 分钟拍剪影和江面反光。', '记录一句：武汉的浪漫在江边慢慢亮起来。'),
  ],
  恩施: [
    makePoint('es-1', '女儿城', 'food', '恩施', 30.272, 109.487, '10:00', 70, '土家风情和本地小吃集中，适合低强度开场。', '拍吊脚楼元素和小吃摊，保留民族风情。', '记录土家腊肉、合渣和街区音乐。'),
    makePoint('es-2', '恩施大峡谷游客中心', 'rest', '恩施', 30.404, 109.191, '12:00', 30, '进入峡谷前的补给点，适合确认体力和天气。', '拍路线牌和山体远景，做进入自然的转场。', '记录从城市到峡谷的路途变化。'),
    makePoint('es-3', '七星寨栈道', 'scenic', '恩施', 30.43, 109.18, '13:20', 120, '绝壁、峰丛和栈道构成强烈空间尺度，是短视频核心镜头。', '人物站在栈道转角，山体做背景，穿纯色更出片。', '记录人在峡谷中变小的视觉冲击。'),
    makePoint('es-4', '云龙地缝瀑布', 'photo', '恩施', 30.414, 109.19, '16:10', 80, '瀑布、地缝和湿润光线适合拍自然纪录片感画面。', '竖屏拍水流从上到下，加入脚步声和水声。', '记录瀑布声、台阶湿气和峡谷回声。'),
    makePoint('es-5', '峡谷民宿观景台', 'end', '恩施', 30.399, 109.204, '19:00', 50, '夜宿山边方便第二天看晨雾，提升三天路线体验。', '蓝调时刻拍灯光和山影，氛围感强。', '记录晚风、山影和第二天云海期待。'),
  ],
  荆州: [
    makePoint('jz-1', '荆州博物馆', 'scenic', '荆州', 30.347, 112.187, '09:40', 90, '楚文化器物集中，适合先建立历史背景。', '拍展厅局部与说明牌，避免强闪光。', '记录楚文化符号，为古城路线做铺垫。'),
    makePoint('jz-2', '宾阳楼', 'photo', '荆州', 30.353, 112.193, '11:30', 50, '城门楼和城墙线条完整，是古城最强识别点。', '人物站城门侧面，拍城墙纵深。', '记录古城墙的尺度和护城河倒影。'),
    makePoint('jz-3', '早堂面老店', 'food', '荆州', 30.34, 112.2, '12:40', 45, '荆州代表味道，适合补充地方烟火气。', '拍面汤、招牌和本地食客，画面更真实。', '记录一碗早堂面如何连接城市记忆。'),
    makePoint('jz-4', '古城墙步道', 'scenic', '荆州', 30.356, 112.19, '15:00', 80, '适合慢走，理解古代城市防御和现代生活交叠。', '傍晚拍城墙砖纹和树影。', '记录“每块砖都有故事”的路演文案。'),
    makePoint('jz-5', '沙市洋码头', 'end', '荆州', 30.307, 112.255, '18:00', 70, '江边街区适合夜景和餐饮收尾。', '拍码头灯光、江面和人流剪影。', '记录古城之外的现代荆州。'),
  ],
  襄阳: [
    makePoint('xy-1', '襄阳古城北街', 'photo', '襄阳', 32.015, 112.146, '10:00', 70, '古城街巷与日常生活并存，适合轻松开场。', '拍街口、牌匾和行人，画面有故事。', '记录古城不是景点，而是生活现场。'),
    makePoint('xy-2', '古隆中', 'scenic', '襄阳', 31.988, 112.045, '12:00', 90, '三国智慧文化核心点，适合历史讲解。', '拍林荫、古建和石刻，避免只拍大门。', '记录诸葛亮故事和年轻人视角的历史理解。'),
    makePoint('xy-3', '襄阳牛肉面', 'food', '襄阳', 32.012, 112.142, '14:00', 45, '牛肉面和黄酒是襄阳味觉名片。', '拍红油、面碗和店内热气，食欲感强。', '记录“来襄阳要吃一碗有劲的面”。'),
    makePoint('xy-4', '唐城影视基地', 'scenic', '襄阳', 32.003, 112.177, '16:00', 100, '古风建筑密集，夜景很适合短视频。', '傍晚转夜景拍灯笼和城楼，古风感强。', '记录从现实古城切换到影视唐风。'),
    makePoint('xy-5', '汉江桥畔', 'end', '襄阳', 32.023, 112.153, '20:00', 40, '汉江夜景适合收尾，形成城市记忆点。', '拍桥、江面和灯带，人物做剪影。', '记录汉江边的风和古城夜色。'),
  ],
  黄石: [
    makePoint('hs-1', '黄石国家矿山公园', 'scenic', '黄石', 30.206, 114.901, '10:00', 100, '矿坑和工业遗产形成强烈视觉差异，是黄石特色核心。', '俯拍矿坑尺度，人物站观景台边缘增强比例。', '记录工业遗产如何变成城市景观。'),
    makePoint('hs-2', '矿冶主题展区', 'rest', '黄石', 30.207, 114.905, '12:00', 35, '适合补充矿冶历史信息，降低路线空泛感。', '拍机械细节和旧厂房材质。', '记录黄石“因矿而兴”的城市底色。'),
    makePoint('hs-3', '磁湖岸线', 'photo', '黄石', 30.208, 115.023, '14:30', 70, '湖岸线松弛，适合从工业风切换到湖山风景。', '拍湖面倒影和岸边树影，画面更柔和。', '记录黄石不只有矿，也有湖风。'),
    makePoint('hs-4', '黄石港饼老店', 'food', '黄石', 30.223, 115.065, '16:20', 40, '地方伴手礼和小吃，适合作为消费转化点。', '拍包装、切面和门店招牌。', '记录一口港饼带走城市味道。'),
    makePoint('hs-5', '团城山公园', 'end', '黄石', 30.203, 115.028, '18:10', 50, '适合傍晚散步和轻松收尾。', '拍城市绿地、落日和远处楼群。', '记录周末短途的低压力结尾。'),
  ],
};

export const baseRoutes: Record<CityName, Omit<SmartRoute, 'startPoint' | 'points'> & { points: RoutePoint[] }> = {
  宜昌: makeRoute('route-yichang', '宜昌三峡江景 AI 导航线', '宜昌', 42.6, '约 2 小时 20 分钟交通 + 5 小时游览', '景区直通车 + 网约车短驳，夜晚城区步行。', '09:00', ['三峡大坝景区需提前看预约规则。', '坛子岭到 185 平台注意景区接驳车时间。', '西坝夜市高峰期排队明显，建议错峰。'], cityRoutePoints.宜昌, {
    highlights: ['长江江景从城区逐步转向三峡工程尺度，视觉层次强。', '坛子岭和 185 平台适合记录“大国工程 + 山水”的湖北名片。', '夜晚回到西坝和滨江，能把工程感转成烟火气。'],
    bestPhotoTimes: ['11:00 坛子岭观景台：光线充足，适合拍大场景。', '18:30 西坝不夜城：灯牌和小吃摊最有生活感。', '20:30 滨江公园：江面灯光适合拍背影。'],
    videoShots: ['出站行李箱推镜头，字幕“AI 带我 600 元玩宜昌”。', '大坝远景横移，配旁白“长江在这里有了新的节奏”。', '凉虾和萝卜饺子特写，切到江边夜景收尾。'],
    socialCopy: '宜昌这条线很适合第一次来湖北看长江：白天被三峡大坝震撼，晚上在江边吃凉虾，攻略被 AI 变成了可以直接走的路线。',
    crowdTips: { 学生: '重点记录预算控制和交通接驳，适合做“低预算也能看三峡”的内容。', 情侣: '把滨江夜景和西坝美食作为情绪收尾，照片更有故事。', 家庭: '坛子岭适合工程科普，注意减少夜晚步行距离。', 老人: '景区内多用接驳车，避免长时间爬坡和暴晒。' },
  }),
  武汉: makeRoute('route-wuhan', '武汉江城 Citywalk 规则路线图', '武汉', 18.8, '约 1 小时 10 分钟交通 + 5 小时步行游览', '地铁 + 步行，江滩段建议慢走。', '08:50', ['黄鹤楼周边人流较大，上午优先拍照。', '粮道街饭点排队明显，可提前 20 分钟到。', '江滩日落时间随季节变化，提前查询当天日落。'], cityRoutePoints.武汉, {
    highlights: ['昙华林街巷、黄鹤楼红墙和江汉关构成武汉历史线。', '粮道街把文化路线转成烟火气，适合学生预算。', '汉口江滩日落是整条 Citywalk 的情绪顶点。'],
    bestPhotoTimes: ['09:30 昙华林：街巷人少，适合拍咖啡和老建筑。', '11:00 黄鹤楼红墙：颜色饱和，适合人像。', '17:40 江滩：日落和江面反光最适合短视频收尾。'],
    videoShots: ['咖啡杯推近，切昙华林坡道行走镜头。', '黄鹤楼飞檐上摇，叠加诗词字幕。', '江汉关钟楼仰拍后切到江滩日落。'],
    socialCopy: '武汉适合用脚步慢慢打开：从昙华林的咖啡和老墙，到黄鹤楼的诗，再到江滩日落，300 元也能走出很完整的一天。',
    crowdTips: { 学生: '突出 300 元预算和公共交通，适合做收藏型攻略。', 情侣: '江滩日落和昙华林咖啡店适合拍双人情绪照。', 家庭: '减少连续步行，可把江汉关和江滩合并为一段。', 老人: '黄鹤楼周边台阶较多，建议选择外围红墙和江景路线。' },
  }),
  恩施: makeRoute('route-enshi', '恩施峡谷云海 AI 记录线', '恩施', 58.4, '约 3 小时交通 + 6 小时游览', '景区专线/包车更稳，山路预留机动时间。', '08:40', ['峡谷天气变化快，雨具和防滑鞋必备。', '栈道游览强度高，老人和小孩需减少点位。', '短视频拍摄不要越过护栏或堵塞栈道。'], cityRoutePoints.恩施, {
    highlights: ['从女儿城到大峡谷，路线呈现土家风情到喀斯特山水的转场。', '七星寨栈道最适合拍“人在峡谷里变小”的镜头。', '云龙地缝瀑布适合用声音和湿润光线增强沉浸感。'],
    bestPhotoTimes: ['13:20 七星寨：山体层次清晰，适合广角。', '16:10 云龙地缝：水流和峡谷阴影更有质感。', '19:00 民宿观景台：蓝调时刻适合拍山影。'],
    videoShots: ['女儿城小吃开场，快速切到山路车窗。', '栈道脚步声 + 绝壁广角，制造空间反差。', '瀑布竖屏慢镜头，最后回到民宿灯光。'],
    socialCopy: '恩施这条线像从城市走进自然纪录片：土家街区、峡谷栈道、瀑布地缝和山边民宿，每一段都值得按下录制键。',
    crowdTips: { 学生: '适合做高冲击短视频，但要控制门票和包车成本。', 情侣: '民宿观景台和峡谷栈道适合拍双人背影。', 家庭: '建议降低徒步强度，把女儿城和游客中心作为休息点。', 老人: '优先选择观景台和低强度区域，避免完整栈道穿越。' },
  }),
  荆州: makeRoute('route-jingzhou', '荆州楚文化古城规则路线图', '荆州', 16.5, '约 55 分钟交通 + 5 小时游览', '打车短驳 + 古城步行，下午适合慢走城墙。', '09:00', ['博物馆注意闭馆日。', '城墙步道夏季较晒，建议带水。', '古城周边停车紧张，优先公共交通或打车。'], cityRoutePoints.荆州, {
    highlights: ['博物馆先建立楚文化背景，再进入古城墙，内容逻辑清晰。', '宾阳楼和护城河是最适合出片的古城符号。', '沙市洋码头让路线从古城延伸到江边生活。'],
    bestPhotoTimes: ['11:30 宾阳楼：城门和城墙纵深清楚。', '15:30 古城墙：树影和砖纹更柔和。', '18:00 洋码头：灯光和江面适合夜景开场。'],
    videoShots: ['博物馆文物局部开场，叠加“楚文化从这里开始”。', '城门穿行镜头，切护城河倒影。', '早堂面热气和洋码头夜景收尾。'],
    socialCopy: '荆州适合慢慢走，先在博物馆看见楚文化，再沿古城墙听风，最后到江边吃一碗热气腾腾的城市味道。',
    crowdTips: { 学生: '可突出历史知识和低成本 Citywalk。', 情侣: '宾阳楼和护城河适合古风合照。', 家庭: '博物馆 + 城墙适合亲子讲解。', 老人: '减少城墙长距离步行，保留博物馆和城门核心点。' },
  }),
  襄阳: makeRoute('route-xiangyang', '襄阳汉江古城 AI 导航线', '襄阳', 28.7, '约 1 小时 40 分钟交通 + 5.5 小时游览', '古城步行 + 打车去古隆中和唐城。', '09:00', ['唐城夜景门票和开放时间需提前确认。', '古隆中游览需预留上下坡时间。', '牛肉面热门店可能上午售罄。'], cityRoutePoints.襄阳, {
    highlights: ['古城北街、古隆中和唐城串联出三国文化与古风影像。', '牛肉面提供强烈地方味觉记忆。', '汉江夜景适合作为城市收尾。'],
    bestPhotoTimes: ['10:00 北街：行人不多，街巷生活感强。', '16:30 唐城：日景转夜景层次丰富。', '20:00 汉江桥畔：灯带和江面适合剪影。'],
    videoShots: ['北街巷口推镜头，切到古隆中林荫。', '牛肉面红油特写制造味觉记忆。', '唐城灯笼和汉江桥畔夜景收尾。'],
    socialCopy: '襄阳这条线有古城、有三国、有汉江，也有一碗热辣的牛肉面。白天走历史，晚上走进古风夜色。',
    crowdTips: { 学生: '唐城夜景适合短视频，但预算要预留门票。', 情侣: '唐城和汉江夜景适合双人照片。', 家庭: '古隆中适合历史讲解，注意体力分配。', 老人: '减少唐城夜游时长，避免过晚返程。' },
  }),
  黄石: makeRoute('route-huangshi', '黄石矿冶湖山 AI 周末线', '黄石', 24.2, '约 1 小时 30 分钟交通 + 4.5 小时游览', '打车短驳更省时，湖边可步行。', '09:00', ['矿山公园观景台注意安全距离。', '湖边风大时注意保暖。', '伴手礼购买注意生产日期和携带重量。'], cityRoutePoints.黄石, {
    highlights: ['矿山公园展现黄石工业遗产，磁湖岸线提供自然缓冲。', '港饼老店适合本地消费转化。', '团城山公园让路线以低压力方式收尾。'],
    bestPhotoTimes: ['10:30 矿坑观景台：阳光能凸显地貌层次。', '14:30 磁湖岸线：湖面反光柔和。', '18:10 团城山：傍晚适合拍城市绿地。'],
    videoShots: ['矿坑大远景开场，配“湖北也有工业大片”。', '机械细节和红砖墙切换，突出工业风。', '磁湖水面和港饼特写做反差转场。'],
    socialCopy: '黄石不是只有工业标签，矿坑的震撼、磁湖的风和一口港饼，拼成了一条很适合周末的湖北小众路线。',
    crowdTips: { 学生: '工业风画面适合拍酷感短视频。', 情侣: '磁湖岸线和团城山适合轻松合照。', 家庭: '矿冶主题可做研学内容，注意安全边界。', 老人: '减少矿坑长时间步行，增加湖边休息。' },
  }),
};

function makePoint(
  id: string,
  name: string,
  type: RoutePoint['type'],
  city: CityName,
  lat: number,
  lng: number,
  time: string,
  stayMinutes: number,
  reason: string,
  photoTip: string,
  recordTip: string,
): RoutePoint {
  const roadAccess = getRoadAccessCoordinates(name);
  return { id, name, type, city, lat, lng, time, stayMinutes, reason, photoTip, recordTip, ...(roadAccess ? { roadAccessLat: roadAccess[0], roadAccessLng: roadAccess[1] } : {}), coordinateSystem: 'gcj02', ...pointMedia[name] };
}

// 景区内部、步行街与观景台使用可驾车入口参与 Driving；地图 Marker 仍保留景点本身坐标。
function getRoadAccessCoordinates(name: string): [number, number] | undefined {
  return ({
    昙华林: [30.5538, 114.3050], 黄鹤楼红墙: [30.5464, 114.3028], 粮道街: [30.5450, 114.3095],
    坛子岭观景台: [30.8188, 111.0206], '185 平台': [30.8188, 111.0206], 西坝不夜城: [30.7072, 111.2897],
    恩施大峡谷游客中心: [30.4035, 109.1905], 七星寨栈道: [30.4035, 109.1905], 云龙地缝瀑布: [30.4035, 109.1905], 峡谷民宿观景台: [30.3982, 109.2050],
    荆州博物馆: [30.3472, 112.1858], 宾阳楼: [30.3522, 112.1951], 古城墙步道: [30.3548, 112.1925],
    襄阳古城北街: [32.0158, 112.1468], 古隆中: [31.9872, 112.0469], 唐城影视基地: [32.0042, 112.1800],
    黄石国家矿山公园: [30.2048, 114.9027], 矿冶主题展区: [30.2048, 114.9027], 磁湖岸线: [30.2090, 115.0212], 团城山公园: [30.2044, 115.0290],
  } satisfies Record<string, [number, number]>)[name];
}

function makeRoute(
  id: string,
  title: string,
  city: CityName,
  totalDistanceKm: number,
  estimatedTime: string,
  transportSuggestion: string,
  recommendedStartTime: string,
  avoidTips: string[],
  points: RoutePoint[],
  sceneryAnalysis: SmartRoute['sceneryAnalysis'],
): Omit<SmartRoute, 'startPoint' | 'points'> & { points: RoutePoint[] } {
  return { id, title, city, totalDistanceKm, estimatedTime, transportSuggestion, recommendedStartTime, avoidTips, points, sceneryAnalysis };
}

