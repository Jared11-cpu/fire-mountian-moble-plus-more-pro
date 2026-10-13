# 楚游智导后端接口

服务端运行在 Sites Worker 风格运行时中。所有真实地点、路线、路况字段来自高德；千问仅负责提取、排序和解释。

## 环境变量

| 变量 | 必需 | 用途 |
| --- | --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 地图接口必需 | 高德 Web 服务 API Key |
| `DASHSCOPE_API_KEY` | AI 接口必需 | 阿里云百炼 API Key |
| `AI_BASE_URL` | 否 | 百炼 OpenAI 兼容地址；Workspace 新地址可在此配置 |
| `DASHSCOPE_WORKSPACE_ID` | 否 | 配置后自动使用 Workspace 专用兼容地址 |
| `AI_EXTRACT_MODEL` | 否 | 默认 `qwen-flash` |
| `AI_RECOMMEND_MODEL` | 否 | 默认 `qwen-plus` |
| `ALLOWED_ORIGINS` | 否 | 额外允许的前端 Origin，逗号分隔 |

密钥仅放服务端运行时环境变量，不能使用 `VITE_` 前缀。

## 主要请求示例

### 自然语言需求提取

`POST /api/ai/parse-request`

```json
{ "text": "两个人去武汉玩两天，人均800，少走路，想吃湖北菜" }
```

### 真实餐厅搜索

`GET /api/restaurants/search?city=武汉&keywords=湖北菜&location=114.30,30.59&pageSize=15`

其他搜索入口：`/api/poi/search`、`/api/shops/search`、`/api/hotels/search`、`/api/attractions/search`。

### 一步完成餐厅或店铺指导

- `POST /api/restaurants/guide`
- `POST /api/shops/guide`
- `POST /api/guide/recommend`（通过 `category` 选择类型）

```json
{
  "city": "武汉",
  "keywords": "湖北菜",
  "location": { "lng": 114.3, "lat": 30.59 },
  "limit": 15,
  "preferences": { "budgetPerPerson": 100, "dietaryNeeds": ["少辣"], "mobility": "少步行" }
}
```

后端会先向高德取得真实候选，再交给千问排序，最后将推荐理由与原始事实合并返回。

### 商家住客服务方案

`POST /api/business/plan`

```json
{ "name": "西陵江景民宿", "city": "宜昌", "spots": "三峡大坝，滨江公园", "target": "情侣" }
```

后端先用高德核实每个景点（最多 4 个）并检索第一个景点 2 公里内的餐厅，再让千问只基于这些事实生成文案；美食推荐只保留提到真实餐厅的条目。响应中的 `unmatchedSpots` 列出高德没有找到的景点。

### 仅在真实候选中进行 AI 排序

`POST /api/ai/recommend`

```json
{
  "userPreferences": { "budgetPerPerson": 100, "dietaryNeeds": ["不吃辣"] },
  "candidates": [
    { "id": "AMAP_POI_ID", "name": "候选餐厅", "rating": 4.6, "averageCost": 68, "openingHours": "10:00-22:00" }
  ]
}
```

AI 返回不存在的候选 ID 时，后端会拒绝结果。

### 自定义旅行分析

`POST /api/ai/analyze`

```json
{
  "question": "这套路线适合带老人吗？",
  "context": { "walkingMeters": 3200, "stairsKnown": false, "traveler": "老人" }
}
```

事实不足会写入 `dataGaps`，不会由 AI 补造。

### 动态地铁/公交查询

`GET /api/transit/realtime?city=武汉&origin=114.30,30.59&destination=114.40,30.51&strategy=least-walking`

该接口返回当前时刻重新计算的动态路线，`freshness` 为 `live-query`。它不包含车辆 GPS、列车位置或精确到站倒计时；这些能力必须接入当地公交/地铁运营方的授权数据源。

### 路况与路线

- `GET /api/traffic/status?center=114.30,30.59&radius=1000`
- `GET /api/traffic/status?rectangle=114.20,30.50;114.40,30.70`
- `POST /api/route/plan`，请求体包含 `origin`、`destination`、`mode`；`mode` 支持 `driving`、`walking`、`bicycling`、`transit`。

## 刷新建议

- 驾车路况：30-60 秒。
- 公交/地铁动态路线：60-120 秒。
- 餐厅/店铺 POI：2 分钟以上，避免频繁消耗配额。

前端应显示响应中的 `generatedAt`、`freshness` 和 `dataNotice/notices`，不得把 `live-query` 展示成车辆级实时定位。
