# 楚游智导 AI

面向游客、景区、城市文旅部门、民宿老板的湖北文旅 AI 智能体平台 Demo。项目定位为 2026 年湖北省“火山杯”AI 创客大赛青年 AI 创新赛道展示作品，核心体验是：用户一句话输入旅行需求，AI 自动生成完整旅行方案、景点讲解、预算表、拍照点、短视频脚本、朋友圈文案，并可延展为城市旅行小程序原型。

## 安装运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 核心功能

- 首页 Landing Page：项目 Logo、Slogan、湖北城市入口、游客/景区/民宿/文旅部门价值展示。
- AI 旅行规划页：目的地、天数、预算、兴趣、人群和自然语言输入，点击生成后直接切换到地图工作台，避免输入页与地图页同屏堆叠。
- 交互式 AI 行程工作台：把页面做成“左侧功能侧栏 + 中间实况地图 + 右侧行程面板”的行程图片卡式体验，但保留可点击交互。
- 定位 + 道路路线地图：支持浏览器定位、示例出发地、高德 JS API 2.0 Driving 道路规划、Marker 点位详情和路线导航高亮。
- 交通/沿路景点/美食/预算/每日记录/天气预警模块：在同一个行程工作台内切换，预算支持用户自定义输入，每日记录支持日期和打卡，天气预警按路线起点实时刷新。
- 旅行足迹详情：首页足迹数字可直接跳转到旅行手账详情页，查看地点、里程、城市和照片。
- 沿途 AI 观察：根据路线生成风景亮点、最佳拍照时间、短视频镜头、社交文案和不同人群记录重点。
- 景点 AI 讲解页：三峡大坝、黄鹤楼、恩施大峡谷、荆州古城、武当山、东湖，支持通俗版、年轻人版、亲子版、短视频口播、朋友圈文案、拍照建议。
- 民宿/景区商家后台页：生成周边一日游、欢迎语、入住提醒、周边美食、短视频宣传脚本、小红书种草文案和客服自动回复。
- 城市文旅数据看板页：热门城市、热门兴趣标签、预算分布、高热度景点、传播建议和关键词云。
- 项目介绍/比赛路演页：项目背景、用户痛点、解决方案、AI 创新点、Vibe Coding 创新点、社会价值、商业模式、落地场景、未来规划。

## 内置示例

- 宜昌两天一夜，预算 600，拍照和美食。
- 武汉一日 Citywalk，预算 300，历史文化和咖啡。
- 恩施三天两夜，预算 1000，自然风光和短视频。

## 比赛创新点

- AI 创新：将自然语言旅行需求解析为路线、预算、讲解、内容传播、商家服务等多种结构化交付物。
- Vibe Coding 创新：用户只需要用自然语言描述旅行需求，系统就能自动完成需求理解、路线生成、内容生成、页面生成和文旅服务方案生成，实现从“旅行想法”到“可执行行程”和“可传播内容”的快速转化。
- 社会价值：降低游客攻略成本，帮助景区、民宿和文旅部门获得低门槛数字化能力，提升湖北文旅资源的年轻化传播力。
- 创业可行性：覆盖 C 端会员订阅、B 端景区 AI 讲解系统、民宿酒店 AI 住客服务助手、文旅部门数据看板、本地商户广告推荐和联名路线服务。

## 定位与路线地图 Demo

AI 规划页新增了“定位 + 路线 + 沿途记录点”能力：

- `src/services/locationService.ts`：封装浏览器 Geolocation 调用、定位失败处理和 Mock 出发地。
- `src/services/mapService.ts`：封装路线生成入口；`src/services/amapDriving.ts` 负责 Driving 分段请求、道路几何、距离和时间解析。
- `src/data/routeData.ts`：内置武汉、宜昌、恩施、荆州、襄阳、黄石的 Mock 路线、经纬度、拍照建议和沿途观察。
- `src/components/MapWorkspace.tsx`：交互式行程工作台，包含左侧侧栏、路线地图、沿路景点、日程、交通、美食和预算。
- `src/components/RouteMap.tsx`：接入高德 JS API 2.0 `AMap.Driving`；成功时只绘制 `result.routes[0].steps.path` 道路几何，失败时明确显示红色虚线点位连线和错误状态。
- `src/components/ItineraryImageCard.tsx`：保留为后续导出分享图的扩展组件，当前主页面以可交互工作台为主。
- `src/components/RouteInsightPanel.tsx`：展示沿途风景亮点、拍照时间、短视频镜头和人群化记录建议。
- `src/types/route.ts`：定义 `RoutePoint`、`SmartRoute`、`UserLocation` 等结构。

路线规划由浏览器直接调用高德 JS API 2.0 Driving，不依赖自建后端。用户可以点击“使用当前位置”调用浏览器定位；如果拒绝授权或浏览器不支持定位，系统会回退到武汉站、宜昌东站、恩施站、荆州站、襄阳东站、黄石北站等示例出发地。只有高德返回 `complete` 且存在 `routes[0]` 时，界面才显示真实道路距离和预计行车时间；否则只显示带“估算”标识的点位虚线。

如需启用真实高德地图，可在 `.env.local` 中配置：

```bash
VITE_AMAP_ENABLED=true
VITE_AMAP_KEY=你的高德 JS API Key
VITE_AMAP_SECURITY_CODE=你的高德安全密钥
```

如果没有配置或域名未授权，页面会自动使用演示地图，保证比赛 Demo 可稳定运行。真实高德路线规划还需要在高德开放平台检查：

- JS API Key 的 Web 端域名白名单包含本地演示域名，例如 `localhost:5173`，以及后续部署域名。
- Key 已开通 JS API 2.0 和驾车路径规划相关服务权限。
- GitHub Pages 部署后，需要把 `Jared11-cpu.github.io` 对应页面域名加入白名单。

### 生产环境安全说明

Vite 会把所有 `VITE_` 变量写入浏览器可下载的构建产物，因此 `VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_CODE` **不是完全保密的服务端秘密**。生产部署应使用高德“Web 端（JS API）”Key，启用安全密钥校验、精确配置域名白名单并设置合理配额和告警；任何服务端 Web 服务私钥都必须保存在后端，不能通过 `VITE_` 变量下发。

GitHub Pages workflow 可从 Actions Variables 或 Secrets 读取：

- `VITE_AMAP_ENABLED`：建议 Variable，值为 `true`。
- `VITE_AMAP_KEY`：可配置为 Secret 或 Variable。
- `VITE_AMAP_SECURITY_CODE`：可配置为 Secret 或 Variable。

未配置、授权失败、网络失败或高德无路线数据时，页面会分别显示 `auth-error`、`network-error`、`no-data` 或 `fallback` 降级状态，不会把景点经纬度直线宣称为真实道路。

## 后续接入真实 AI API 的位置

当前项目不依赖真实后端，AI 结果由前端 Mock 函数生成：

- `src/utils/aiGenerator.ts`
  - `generateTravelPlan`：旅行方案生成。
  - `generateBusinessPlan`：商家住客服务方案生成。
- `src/services/locationService.ts`
  - 可接入浏览器 Geolocation 和高德逆地理编码，把经纬度转换为真实城市、道路和 POI。
- `src/services/mapService.ts`
  - 可接入高德地图 JS API / Web 服务 API，替换 Mock 路线为真实驾车、公交、步行路径规划。
- `src/data/routeData.ts`
  - 可替换为城市文旅知识库、景区开放数据、天气接口和本地商户数据。

后续接入真实模型时，可把这两个函数替换为 API 请求，例如：

1. 在前端调用自建 `/api/generate-travel-plan` 和 `/api/generate-business-plan`。
2. 服务端接入大模型、地图 API、景区开放数据、OTA 数据和商家 CRM。
3. 保持返回结构与 `TravelPlan`、`BusinessPlan` 类型一致，即可复用现有页面组件。

## 后续接入高德地图 API 的位置

建议分三步替换 Mock 能力：

1. 高德地图 JS API：在 `RouteMap.tsx` 中用真实地图容器替换 SVG 模拟地图，使用 Polyline 绘制真实路线。
2. 高德 Web 服务 API：在 `mapService.ts` 中接入 POI 搜索、路径规划、地理编码和逆地理编码。
3. 天气与真实 AI API：根据天气、开放时间、拥堵情况和用户偏好，动态生成拍照建议、避坑提醒、短视频脚本和朋友圈文案。

## 公交与地铁动态路线

项目已提供 `/api/transit/plan` Sites 服务端代理和混合交通展示：后端逐段调用高德路径规划 2.0，前端展示地铁/公交线路名、上下车站、途经站、运营时间、预计票价、步行接驳，并在地图上按交通方式分色绘制真实坐标线。

- Sites 运行时配置 `AMAP_WEB_SERVICE_KEY`（高德“Web 服务 API”Key，不能使用前端 JS API Key）。
- GitHub Pages 在 Actions Variable 中配置 `VITE_TRANSPORT_API_URL`，指向已部署 Sites 的 `/api/transit/plan`。
- Sites 同域访问会自动使用 `/api/transit/plan`；本地和 GitHub Pages 未配置代理时安全降级为规则估算。
- “动态路线查询”会根据当前日期、时间和换乘策略重新算路，但不代表公交车辆 GPS、地铁列车位置或精确到站倒计时；车辆级实时能力需接入运营方授权数据源。

## 后端旅游智能接口

Sites 服务端已保持现有前端页面和 `/api/transit/plan` 契约不变，并增加以下接口：

- `POST /api/ai/parse-request`：千问提取用户自然语言旅行需求。
- `POST /api/ai/recommend`：只在高德真实候选地点中排序，不允许 AI 改写事实。
- `POST /api/ai/analyze`：基于用户给定上下文进行自定义旅行分析，缺失数据会单独列出。
- `POST /api/ai/transport-advice`：只解释已有交通方案，不让 AI 编造线路、时间或票价。
- `GET /api/poi/search`、`/api/restaurants/search`、`/api/shops/search`、`/api/hotels/search`、`/api/attractions/search`：高德真实地点检索。
- `POST /api/restaurants/guide`、`/api/shops/guide`：一次请求完成高德真实候选检索与千问个性化排序。
- `POST /api/route/plan`：驾车、步行、骑行或公交路线规划。
- `GET /api/traffic/status`：指定矩形、圆形范围或道路的动态路况。
- `GET /api/transit/realtime`：当前时刻的公交/地铁动态方案；响应会明确标注不包含车辆 GPS。
- `GET /api/health`：检查 AI、地图和车辆级实时能力是否可用。

Sites 运行时需要配置 `AMAP_WEB_SERVICE_KEY` 和 `DASHSCOPE_API_KEY`。可选配置 `AI_BASE_URL`、`AI_EXTRACT_MODEL`、`AI_RECOMMEND_MODEL`、`DASHSCOPE_WORKSPACE_ID` 与 `ALLOWED_ORIGINS`。这些服务端密钥不能使用 `VITE_` 前缀。

武汉首页使用 3 张经过宽屏适配筛选的本地高清城市影像，并通过 `GET /api/showcase/wuhan` 在每次进入武汉画面时选择一张。默认由后端随机返回；如需固定主视觉，可在 Sites 运行时设置 `WUHAN_HERO_IMAGE`。可选值：`river-bridge-night`、`river-skyline`、`lakes-skyline`。接口不可用时，前端仍会从同一图库随机选择，不影响首页交互。

餐厅/店铺推荐的可靠流程是：先调用高德搜索取得真实 POI，再把候选列表传入 `/api/ai/recommend` 排序。营业时间、人均消费和评分可能缺失或变化，接口会保留数据来源与查询时间，最终下单前仍需以商家公告为准。

交通面板在页面打开期间每 90 秒静默刷新一次动态路线，不改变现有页面布局；手动刷新仍然保留。只有运营方授权数据源才能把状态升级为车辆级实时定位。
