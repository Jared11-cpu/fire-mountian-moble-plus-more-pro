# 楚游智导 AI

面向游客、景区、民宿和城市文旅部门的湖北文旅 AI 智能体，2026 年湖北省“火山杯”AI 创客大赛青年 AI 创新赛道参赛作品。核心体验：用户用一句话描述旅行需求，系统基于高德真实地点与千问分析生成可执行的行程、路线、餐饮和预算方案。

## 本地运行

```bash
pnpm install
pnpm dev          # http://localhost:5173/fire-mountain-v2-plus-mega-max/#/
pnpm test         # Vitest 单元与组件测试
pnpm run typecheck
pnpm test:e2e     # Playwright（需本地 Chromium）
```

- 开发服务器的基础路径默认为 `/fire-mountain-v2-plus-mega-max/`，可用 `VITE_BASE_PATH` 覆盖；路由使用 HashRouter（`/#/planner`）。
- 本地没有后端时，前端请求 `/api/*` 会失败：行程生成会提示“AI 服务暂不可用”，不会展示规则占位方案。需要完整体验时，把 `VITE_API_BASE_URL` 指向已部署的后端。

## 架构与部署

| 部分 | 位置 | 部署方式 |
| --- | --- | --- |
| 前端（Vite + React） | `src/` | GitHub Pages：push 到 `main` 后由 `.github/workflows/deploy.yml` 先跑 `pnpm test` 与类型检查，再构建发布 |
| 后端（Worker 风格运行时） | `server/` | Sites 托管：`pnpm build` 把 `server/` 与 `.openai/hosting.json` 一起打包到 `dist/`，服务端改动需要重新部署 Sites 才生效 |
| Vercel 代理 | `api/router.js`、`vercel.json` | 把 `/api/*` 转发到 Sites 后端（`API_UPSTREAM_ORIGIN`，默认见 `api/router.js`） |

后端只做两件事：高德负责所有真实事实（地点、坐标、路线、路况、餐厅人均），千问只负责理解需求、在真实候选中排序和解释。接口清单、请求示例与环境变量见 [`server/README.md`](server/README.md)。

## 行程生成流程

用户点击生成后，规划页会显示三步进度、已用时间和“取消生成”按钮：

1. **理解需求**：`/api/ai/parse-request`（千问）提取城市、天数、预算、兴趣、必去与避开地点，并与本地规则识别结果合并。
2. **检索真实景点**：按必去地点、城市地标和兴趣并发调用 `/api/attractions/search`，再由 `/api/ai/recommend` 在真实候选中排序。
3. **餐厅、排程与预算分析**：
   - `/api/restaurants/guide` 沿最终路线检索周边真实餐厅，按每顿预算排序；
   - `/api/ai/schedule` 生成 07:30–21:30 内的安全排程，AI 结果不合格或超时时由服务端按停留与交通时长自动校正；
   - `/api/ai/analyze` 拿到路线、餐厅人均、预算分配与餐饮估算，明确回答预算是否够用、兴趣是否被满足。

只有真实地点和 AI 分析都返回后才发布方案；前端不会把规则草稿当成最终结果展示。

## 主要页面

- **首页**：湖北六城主视觉。点击城市弹出规划面板，写一句想法即可“直接生成行程”，也可以进入完整表单补充出发地、日期、饮食与特殊需求。
- **AI 行程工作台**（`/#/planner`）：左侧模块、中间高德地图、右侧行程面板，包含总览、沿路景点、交通、美食、预算、每日记录与天气提醒。
  - 路线距离分为“实际路线距离”（高德道路规划结果，只读）与“期望距离上限”（用户可设置）。
  - 出发日期早于今天时会提醒，需改为实际日期或确认后才能生成。
- **旅行手账**（`/#/journal`）：地点、里程、城市和照片，数据保存在浏览器本地。
- **商家后台**（`/#/business`）：选择城市并填写周边景点后，`/api/business/plan` 先用高德核实景点和周边餐厅，再由千问生成一日游路线、欢迎语、入住提醒、美食推荐、短视频脚本、种草文案和客服话术。AI 不可用时回退到本地规则模板，页面会注明来源。
- **文旅数据看板**（`/#/dashboard`）：目前是演示功能，数据为内置模拟数据，页面上已标注。
- **项目介绍**（`/#/about`）：比赛路演内容。

## 地图与密钥

浏览器端高德地图需要在 `.env.local` 配置：

```bash
VITE_AMAP_ENABLED=true
VITE_AMAP_KEY=高德“Web端（JS API）”Key
VITE_AMAP_SECURITY_CODE=高德安全密钥
```

- `VITE_` 变量会编译进浏览器产物，不是服务端秘密：请使用 JS API Key，开启安全密钥校验并配置域名白名单（`localhost:5173`、`jared11-cpu.github.io` 等）。
- 道路规划优先走后端 `/api/route/plan`，失败时再用浏览器端 `AMap.Driving`；都不可用时显示带“估算”标识的点位连线，不会把直线宣称为真实道路。
- 服务端密钥（`AMAP_WEB_SERVICE_KEY`、`DASHSCOPE_API_KEY` 等）只配置在 Sites 运行时环境变量中，绝不能加 `VITE_` 前缀。
- GitHub Pages 构建可从 Actions Variables/Secrets 读取 `VITE_AMAP_ENABLED`、`VITE_AMAP_KEY`、`VITE_AMAP_SECURITY_CODE`、`VITE_API_BASE_URL`、`VITE_TRANSPORT_API_URL`。

## 公交与地铁

`/api/transit/plan` 与 `/api/transit/realtime` 按当前时刻重新算路，返回线路名、上下车站、途经站、票价与步行接驳，交通面板打开期间每 90 秒静默刷新。返回结果标注为 `live-query`，不包含车辆 GPS、列车位置或到站倒计时；车辆级实时能力需要接入运营方授权数据源。

## 比赛创新点

- **AI 创新**：把自然语言旅行需求转成路线、预算、餐饮、讲解与传播内容等结构化交付物，且所有事实来自高德真实数据，AI 只做理解、排序与解释。
- **Vibe Coding 创新**：从“旅行想法”到“可执行行程”和“可传播内容”的快速转化。
- **社会价值**：降低游客攻略成本，帮助景区、民宿和文旅部门获得低门槛数字化能力。
- **商业模式**：C 端会员订阅、B 端景区 AI 讲解、民宿住客服务助手、文旅数据看板、本地商户推荐与联名路线。
