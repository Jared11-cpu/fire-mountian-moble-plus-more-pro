import {
  BarChart3,
  BedDouble,
  Building2,
  Camera,
  Coffee,
  Compass,
  Landmark,
  MapPinned,
  Mountain,
  ShipWheel,
  Sparkles,
  Users,
} from 'lucide-react';

const sceneryBase = `${import.meta.env.BASE_URL}scenery/`;

export type CityName = '宜昌' | '武汉' | '恩施' | '荆州' | '襄阳' | '黄石';

export type City = {
  name: CityName;
  title: string;
  tags: string[];
  image: string;
  imageUrl: string;
  gradient: string;
  imageCredit: { author: string; license: string; sourceUrl: string };
};

export type Attraction = {
  name: string;
  city: string;
  image: string;
  imageUrl: string;
  tags: string[];
  intro: string;
  voices: {
    normal: string;
    youth: string;
    family: string;
    video: string;
    social: string;
    photo: string;
  };
};

export const navItems = [
  { id: 'home', label: '首页' },
  { id: 'planner', label: 'AI 行程' },
  { id: 'journal', label: '旅行手账' },
] as const;

export const moreNavItems = [
  { id: 'business', label: '商家后台' },
  { id: 'dashboard', label: '数据看板' },
  { id: 'pitch', label: '项目介绍' },
] as const;

export const cities: City[] = [
  {
    name: '宜昌',
    title: '三峡山水与长江夜游',
    tags: ['三峡大坝', '清江画廊', '江景美食'],
    image: '三峡水脉',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Three%20Gorges%20Dam.jpg?width=1280',
    imageCredit: { author: 'Dan Kamminga', license: 'CC BY-SA 2.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Three_Gorges_Dam.jpg' },
    gradient: 'from-river via-jade to-[#85C77A]',
  },
  {
    name: '武汉',
    title: '黄鹤楼、东湖与城市咖啡',
    tags: ['Citywalk', '历史文化', '江汉路'],
    image: '江城夜色',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yellow%20Crane%20Tower,%202013%20photo.jpg?width=1280',
    imageCredit: { author: 'Wikimedia Commons contributor', license: 'Commons license', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Yellow_Crane_Tower,_2013_photo.jpg' },
    gradient: 'from-[#243B53] via-river to-tower',
  },
  {
    name: '恩施',
    title: '峡谷、溶洞与短视频大片',
    tags: ['自然风光', '土家文化', '云海'],
    image: '峡谷云阶',
    imageUrl: `${import.meta.env.BASE_URL}uploads/enshi-cover.jpg`,
    imageCredit: { author: '项目方上传', license: '使用授权待确认', sourceUrl: `${import.meta.env.BASE_URL}uploads/enshi-cover.jpg` },
    gradient: 'from-[#1F513F] via-jade to-[#8DBB66]',
  },
  {
    name: '荆州',
    title: '古城墙与楚文化沉浸',
    tags: ['古城', '博物馆', '历史旅拍'],
    image: '楚风古城',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/%E8%8D%86%E5%B7%9E%E5%8F%A4%E5%9F%8E%E5%A2%99.jpg?width=1280',
    imageCredit: { author: 'Kong5579', license: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:%E8%8D%86%E5%B7%9E%E5%8F%A4%E5%9F%8E%E5%A2%99.jpg' },
    gradient: 'from-[#693E2E] via-tower to-[#D8A64D]',
  },
  {
    name: '襄阳',
    title: '古城江湖与唐城夜游',
    tags: ['古风', '影视城', '汉江'],
    image: '汉江城廓',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/China%20Hubei%20Xiangyang%20Tang%20Dynasty%20City%20Film%20and%20TV%20Base5.jpg?width=1280',
    imageCredit: { author: 'Sherbet', license: 'CC BY 2.5', sourceUrl: 'https://commons.wikimedia.org/wiki/File:China_Hubei_Xiangyang_Tang_Dynasty_City_Film_and_TV_Base5.jpg' },
    gradient: 'from-[#31425B] via-[#6F7757] to-[#D6AF62]',
  },
  {
    name: '黄石',
    title: '矿冶工业遗产与湖山周末',
    tags: ['矿山公园', '仙岛湖', '工业风'],
    image: '矿冶湖光',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Ci%20Lake%20lights%20January%202009%20by%20Matthew%20Shaw.jpg?width=1280',
    imageCredit: { author: 'Matthew Shaw', license: 'CC BY 2.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ci_Lake_lights_January_2009_by_Matthew_Shaw.jpg' },
    gradient: 'from-[#293241] via-[#587D71] to-[#D8A64D]',
  },
];

export const valueCards = [
  {
    title: '游客',
    desc: '不用刷攻略，一句话生成旅行路线、预算和内容脚本。',
    icon: Users,
  },
  {
    title: '景区',
    desc: 'AI 讲解升级传统导游体验，按人群自动切换表达风格。',
    icon: Landmark,
  },
  {
    title: '民宿',
    desc: '自动生成周边游推荐、入住提醒和住客服务话术。',
    icon: BedDouble,
  },
  {
    title: '文旅部门',
    desc: '沉淀城市文旅需求数据，提升城市传播力和运营效率。',
    icon: Building2,
  },
];

export const interestOptions = ['美食', '拍照', '历史文化', '自然风光', 'Citywalk', '特种兵旅行'];
export const groupOptions = ['学生', '情侣', '家庭', '朋友', '老人'];
export const dayOptions = [1, 2, 3];
export const budgetOptions = [300, 600, 1000, 1500];

export const examples = [
  {
    label: '宜昌两天一夜',
    city: '宜昌' as CityName,
    days: 2,
    budget: 600,
    interests: ['拍照', '美食'],
    group: '朋友',
    prompt: '我想去宜昌两天一夜，预算 600，喜欢拍照和美食。',
  },
  {
    label: '武汉一日 Citywalk',
    city: '武汉' as CityName,
    days: 1,
    budget: 300,
    interests: ['历史文化', 'Citywalk', '美食'],
    group: '学生',
    prompt: '武汉一日 Citywalk，预算 300，想看历史文化，也想喝咖啡。',
  },
  {
    label: '恩施三天两夜',
    city: '恩施' as CityName,
    days: 3,
    budget: 1000,
    interests: ['自然风光', '拍照'],
    group: '情侣',
    prompt: '恩施三天两夜，预算 1000，想拍短视频和看自然风光。',
  },
];

export const attractions: Attraction[] = [
  {
    name: '三峡大坝',
    city: '宜昌',
    image: '长江中轴',
    imageUrl: `${sceneryBase}yichang.svg`,
    tags: ['大国工程', '江景', '研学'],
    intro: '长江三峡核心地标，适合工程研学、亲子科普和江景打卡。',
    voices: {
      normal: '三峡大坝是世界级水利枢纽工程，连接防洪、发电、航运与水资源调度。来到这里，游客可以从坛子岭俯瞰大坝全貌，理解长江如何被现代工程重新组织。',
      youth: '这里不是单纯看一堵坝，而是看一条大江如何被科技驯服。站在观景台上，水面、船闸和山体同框，很适合拍一组“湖北硬核旅行”大片。',
      family: '可以把这里讲成“长江上的超级水闸”。孩子能看到船怎样升降通行，也能理解为什么防洪和发电对城市很重要。',
      video: '开场给大坝远景，旁白说：“在湖北宜昌，长江有一个超级按钮。”接着切船闸、观景台和游客表情，结尾用江面落日收束。',
      social: '在宜昌看见长江的另一种力量。山水很浪漫，工程也很浪漫。',
      photo: '坛子岭观景台适合拍全景，185 平台适合拍人与坝体的比例感，傍晚光线更柔和。',
    },
  },
  {
    name: '黄鹤楼',
    city: '武汉',
    image: '江城楼影',
    imageUrl: `${sceneryBase}wuhan.svg`,
    tags: ['诗词', '武汉地标', '夜景'],
    intro: '武汉城市名片，串联诗词、长江大桥和城市天际线。',
    voices: {
      normal: '黄鹤楼因诗词名篇而闻名，是武汉最具识别度的文化地标。它连接了长江、蛇山、古代文人想象和现代城市景观。',
      youth: '黄鹤楼的正确打开方式是：白天看飞檐和江景，晚上看灯光和城市。拍照时把长江大桥带进画面，武汉感马上出来。',
      family: '可以从“昔人已乘黄鹤去”的故事讲起，让孩子把诗词和真实地点联系起来，再登楼看长江。',
      video: '第一镜从楼下仰拍飞檐，第二镜登楼推向长江大桥，旁白：“古诗里的楼，现在是武汉的城市封面。”',
      social: '把课本里的黄鹤楼走了一遍，风从长江来，诗也从长江来。',
      photo: '楼前广场适合仰拍，登楼窗口适合拍江景框景，夜间用长焦拍楼体灯光更出片。',
    },
  },
  {
    name: '恩施大峡谷',
    city: '恩施',
    image: '峡谷云海',
    imageUrl: `${sceneryBase}enshi.svg`,
    tags: ['喀斯特', '徒步', '短视频'],
    intro: '湖北自然景观王牌，云海、绝壁、栈道和地质奇观密集。',
    voices: {
      normal: '恩施大峡谷以喀斯特地貌著称，绝壁、峰丛、地缝和云海共同形成强烈的空间层次，是湖北自然风光代表。',
      youth: '这里很适合拍“人在峡谷里变小”的镜头。走栈道时不要急，留意山体线条和云雾变化，随手就是大片。',
      family: '可以把峡谷理解为大自然慢慢雕刻出来的“山的博物馆”。沿途提醒孩子观察岩石纹理和植物变化。',
      video: '用航拍感广角做开场，切脚步走上栈道，再拍云雾掠过山体，旁白：“湖北不只有江，还有会呼吸的峡谷。”',
      social: '在恩施，被山风和云海重新充电。每一步都像走进自然纪录片。',
      photo: '七星寨栈道、绝壁观景点和云龙地缝入口都适合拍，建议穿纯色外套增强人物识别度。',
    },
  },
  {
    name: '荆州古城',
    city: '荆州',
    image: '古城墙影',
    imageUrl: `${sceneryBase}jingzhou.svg`,
    tags: ['楚文化', '三国', '古城'],
    intro: '城墙、护城河与楚文化记忆叠加，适合历史文化游。',
    voices: {
      normal: '荆州古城保留了完整的城墙格局，是理解楚文化、三国故事与古代城市防御体系的重要地点。',
      youth: '如果想拍古风或历史感照片，荆州古城比很多网红街更有质感。城墙、城门、护城河都是天然布景。',
      family: '可以带孩子沿城墙走一段，讲古代城市为什么要建城门、护城河和城楼。',
      video: '从城门推进，切城墙脚步、护城河倒影和古街烟火，旁白：“荆州，把楚文化写在城墙上。”',
      social: '在荆州古城慢下来，城墙不说话，但每块砖都有故事。',
      photo: '宾阳楼、护城河边和城墙转角最适合取景，傍晚可拍暖色城墙。',
    },
  },
  {
    name: '武当山',
    city: '十堰',
    image: '仙山金顶',
    imageUrl: `${sceneryBase}xiangyang.svg`,
    tags: ['道教文化', '古建筑', '山岳'],
    intro: '世界文化遗产，以道教建筑群和山岳景观闻名。',
    voices: {
      normal: '武当山是中国道教名山，古建筑群依山就势，体现了山体、礼制与建筑秩序的融合。',
      youth: '武当山适合拍“东方仙侠感”。石阶、红墙、金顶和云雾组合在一起，很有电影开场气质。',
      family: '可以把武当山讲成“建在山上的古代建筑课”。一路看建筑怎样顺着山势展开。',
      video: '镜头从山门牌匾开始，跟随脚步上台阶，最后给金顶和云雾，旁白：“湖北的山，也可以很仙。”',
      social: '爬到武当山，才知道古人说的仙山不是形容词。',
      photo: '紫霄宫红墙、南岩宫石栏和金顶远景都适合拍，清晨云雾概率更高。',
    },
  },
  {
    name: '东湖',
    city: '武汉',
    image: '湖岸绿道',
    imageUrl: `${sceneryBase}huangshi.svg`,
    tags: ['骑行', '咖啡', '自然城市'],
    intro: '城市湖泊与绿道系统结合，适合松弛感 Citywalk。',
    voices: {
      normal: '东湖是武汉重要的城市生态空间，绿道、湖岸、磨山和咖啡店组成了适合慢旅行的城市风景。',
      youth: '东湖很适合半天松弛游：骑车、看湖、喝咖啡、拍落日。它是武汉最会呼吸的一面。',
      family: '孩子可以在湖边观察植物、鸟类和水面变化，行程强度低，适合亲子散步。',
      video: '开场拍自行车轮和湖面，切咖啡杯、树影、落日，旁白：“在武汉，把半天交给东湖。”',
      social: '东湖的风很会安慰人。走一段绿道，武汉的节奏就慢下来了。',
      photo: '凌波门、磨山索道附近、湖边栈道和落日水面都很出片。',
    },
  },
];

export const dashboardData = {
  hotCities: [
    { name: '武汉', value: 96 },
    { name: '宜昌', value: 89 },
    { name: '恩施', value: 86 },
    { name: '荆州', value: 72 },
    { name: '襄阳', value: 66 },
    { name: '黄石', value: 58 },
  ],
  tags: [
    { name: 'Citywalk', value: 82, icon: Compass },
    { name: '拍照打卡', value: 78, icon: Camera },
    { name: '自然风光', value: 75, icon: Mountain },
    { name: '历史文化', value: 68, icon: Landmark },
    { name: '咖啡美食', value: 63, icon: Coffee },
    { name: '长江夜游', value: 55, icon: ShipWheel },
  ],
  budgets: [
    { label: '300 以下', value: 26 },
    { label: '300-600', value: 42 },
    { label: '600-1000', value: 22 },
    { label: '1000+', value: 10 },
  ],
  scenic: ['黄鹤楼', '三峡大坝', '恩施大峡谷', '东湖', '荆州古城', '武当山'],
  cloud: ['长江', '三峡', '黄鹤楼', '楚文化', 'Citywalk', '土家风情', '云海', '夜游', '咖啡', '古城', '短视频', '亲子研学'],
  suggestions: [
    '武汉适合主推“历史文化 + 咖啡 Citywalk”半日路线，承接年轻周末客群。',
    '宜昌可强化“三峡工程研学 + 江景美食 + 夜游”组合，提升过夜率。',
    '恩施内容传播应突出大峡谷镜头脚本和季节性云海，适合短视频种草。',
  ],
  overview: [
    { label: '模拟需求输入', value: '18.6w', icon: Sparkles },
    { label: '生成路线', value: '42,915', icon: MapPinned },
    { label: '商家方案', value: '3,280', icon: BedDouble },
    { label: '传播指数', value: '91.7', icon: BarChart3 },
  ],
};
