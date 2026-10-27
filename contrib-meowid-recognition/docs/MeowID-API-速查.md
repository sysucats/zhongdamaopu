# 喵ID（MeowID）API 速查

依据 [官方 API 文档](https://meowid.net/developers) 与 [图文教程](https://meowid.net/developers/quickstart) 整理，核对日期为 2026-10-08。接口、费用和限流配置可能变化，以平台当前说明为准。

本文描述 MeowID 的原始 HTTP API。项目由 `unionOp` 包装 EMAS 数据库、平台登录身份和自动同步；原始接口字段与小程序返回字段不同。

## 基础

| 项 | 值 |
| --- | --- |
| API 基址 | 控制台提供的 HTTPS 地址，默认 `https://platform.meowid.net` |
| 鉴权 | `Authorization: Bearer mk_live_…`（也接受拥有该项目的用户登录 Token） |
| 平台官网 | <https://meowid.net> （只用于阅读文档，不接收 API 请求） |
| 控制台 | <https://platform.meowid.net> |

### Scope

| Scope | 允许操作 |
| --- | --- |
| `cats:read` | 读取个体、注册图片列表和图片内容 |
| `cats:write` | 管理个体、注册图片、设置主图、选择注册候选猫 |
| `recognition:write` | 执行猫咪身份识别查询 |
| `tasks:read` | 读取任务状态、结果、统计和预览图片 |

创建 Key 时若不指定 scopes，会授予全部四项。**项目创建、Key 管理、钱包账单需要用户登录 Token，API Key 不能调用。**

### 限流

默认每 Key：识别 **2 次/秒**、注册及写操作 **10 次/秒**、读取 **20 次/秒**。
遇 `429` 按响应头 `Retry-After` 等待后重试。响应头会带 `X-RateLimit-Limit` / `X-RateLimit-Remaining`。

### 图片限制

默认单张上限 **15 MiB**（可配置）；格式仅支持 **JPEG / PNG / WebP**。

### 错误码

| HTTP | 错误码 / detail | 说明 |
| --- | --- | --- |
| 401 | `invalid_api_key` | Key 格式错、密钥不匹配或不存在 |
| 401 | `expired_api_key` | Key 已过期 |
| 403 | `api_key_disabled` / `api_key_revoked` | Key 被禁用或吊销 |
| 403 | `project_mismatch` | Key 不属于该项目 |
| 403 | `scope_denied` | 缺少接口所需权限 |
| 403 | `ip_not_allowed` | 来源 IP 不在白名单 |
| 404 | `Not found` | 项目 / 个体 / 图片 / 任务不存在 |
| 409 | `Conflict` | 任务当前状态不允许此操作 |
| 413 | `Image is too large` | 图片超过大小限制 |
| 415 | `Unsupported media type` | 只支持 JPEG / PNG / WebP |
| 422 | `Validation error` | 字段类型 / 必填项 / 范围有问题 |
| 429 | `rate_limit_exceeded` | 降低并发，按 `Retry-After` 重试 |
| 503 | `Recognition task failed` | 推理不可用，查任务状态再决定是否重试 |

⚠️ 错误响应的 `detail` 可能是**字符串、结构化对象或校验数组**，不要假定它是字符串。
⚠️ 排查问题时**保留 HTTP 状态码和 `X-Request-Id`**，官方支持要靠它定位。

---

## 识别猫咪

**`POST /v1/projects/{project_id}/search`** · 需要 `recognition:write`

- `multipart/form-data`，**必填字段名固定为 `image`**，每次一张图。
- 使用提供 multipart 编码的客户端时，让客户端生成 `Content-Type` 与 boundary。
  本参考实现使用 Node 内置模块自行编码，因此自行设置含 boundary 的 `Content-Type`，
  并按实际字节数设置 `Content-Length`；两者必须与请求正文一致。
- 查询参数：`top_k`(1~100, 默认 5)、`threshold`(−1~1, **省略则用模型默认值**)。
- 该接口**会等推理完成再返回**（官方 Python 示例给 `timeout=120`）。

响应：

```json
{
  "cat_count": 1,
  "route": "face",
  "face_detected": true,
  "unknown": false,
  "matches": [
    { "cat_id": "…", "cat_name": "Mimi", "score": 0.91, "support": 2 }
  ],
  "candidates": [
    { "index": 0, "score": 0.95, "route": "face", "face_detected": true, "unknown": false, "matches": [] }
  ],
  "task_id": "…"
}
```

**正确读法（官方第 9 节）：**

| 字段 | 含义 |
| --- | --- |
| `cat_count` | 检测到的**猫咪总数**。为 `0` 表示这张照片里没找到猫 |
| `unknown` | `true` = 没有可用匹配，或最高分未达到传入的阈值 |
| `matches[0]` | 相似度排序首位候选，**不代表一定匹配成功** |
| `matches[].score` | **个体相似度**（不是"识别正确率"） |
| `matches[].support` | 该候选在同路由特征空间中的有效向量数 |
| `candidates[].score` | ⚠️ **是检测分数，不是个体相似度**（两个 score 含义不同，容易混淆） |
| `route` | `face`（猫脸）或 `body`（全身），平台自动选择 |

⚠️ **顶层 `unknown` / `matches` 只对应第一只检测到的猫**。照片里有多只猫时必须遍历 `candidates`，
逐只读它自己的 `unknown` / `matches`。
⚠️ `cat_count = 0` 时**不要直接访问 `matches[0]`**。
官方示例没有 bbox 字段。页面应允许没有检测框的结果，避免将候选个体相似度误当成框的检测分数。

### 云函数的结果解析

`meowRequest` 的内部结果是 `{ body, status, headers }`，解析器应读取 `body` 中的 JSON。
当前实现已修复误将整个 HTTP 包装对象作为搜索结果的问题，并校验 `cat_count` 为非负整数；
无效服务响应会作为错误返回，不应显示成「照片没有猫」。

云函数将 `cat_count` 转为 `catCount`，并将云端 `cat_id` 通过 `cat.meowid_id` 映射为
本地 `recognizeResults`，保留 `unknown` 和多猫候选语义；没有应用内每日额度或广告奖励。


---

## 建档流程（异步）

### 1. 创建个体

**`POST /v1/projects/{project_id}/cats`** · `cats:write`

```json
{ "name": "Mimi", "metadata": { "personality": "亲人" }, "active": true }
```

`name` 1~100 字符必填；`active` 默认 true，**关掉后这只猫不参与识别搜索**。
`metadata` 是自定义 JSON，可存性格、备注等，识别响应**不会**直接返回它，要用 `cat_id` 自己关联。

### 2. 上传注册图片

**`POST /v1/projects/{project_id}/cats/{cat_id}/images`** · `cats:write`

- `multipart/form-data`，字段名同样固定 `image`。
- 成功返回 **HTTP 202 + `task_id`**。
- 上传受理时 `vectors_added` 为 0 属正常，特征提取是异步的。
  不应仅凭该字段或上传成功判断图片可以检索；继续检查对应任务是否 `completed`。

### 3. 轮询任务

**`GET /v1/projects/{project_id}/tasks?limit=100&offset=0`** · `tasks:read`

- `limit` 1~200（默认 100），`offset` ≥ 0；按创建时间**倒序**，翻页要按任务 ID 去重。
- ⚠️ **没有 `GET /tasks/{task_id}` 单查接口**，只能拉列表自己找。
- 状态机：

```
queued → running → completed
                 → waiting_user → selection → queued
                 → failed → retry → queued
```

- `waiting_user`：这张图里检测到**多只猫**，需要人工到控制台「任务队列」指定目标猫
  （或调 `selection` 接口传 `candidate_index`）。
- `failed`：只有 failed 且保留源数据的任务能 `retry`。

⚠️ **请求超时不等于任务失败**。先查任务列表，避免重复上传产生额外调用和费用
（接口**没有**幂等键去重保证）。

---

## 其它常用接口

| 用途 | 接口 | Scope |
| --- | --- | --- |
| 个体列表 | `GET /v1/projects/{pid}/cats` | `cats:read` |
| 修改个体 | `PATCH /v1/projects/{pid}/cats/{cat_id}` | `cats:write` |
| 删除个体（连带清理图片与向量） | `DELETE /v1/projects/{pid}/cats/{cat_id}` → 204 | `cats:write` |
| 注册图片列表 | `GET /v1/projects/{pid}/cats/{cat_id}/images` | `cats:read` |
| 取图片内容（**返回二进制，不是 JSON**） | `GET …/images/{image_id}/content` | `cats:read` |
| 设为主图 | `PATCH …/images/{image_id}/primary` | `cats:write` |
| 删除图片 | `DELETE …/images/{image_id}` | `cats:write` |
| 任务统计 | `GET /v1/projects/{pid}/tasks/summary` | `tasks:read` |
| 查询原图（二进制） | `GET /v1/projects/{pid}/tasks/{task_id}/query` | `tasks:read` |
| 候选猫图片（二进制） | `GET …/tasks/{task_id}/candidates/{candidate_index}` | `tasks:read` |
| 选择注册候选猫 | `POST …/tasks/{task_id}/selection` `{"candidate_index":0}` | `cats:write` |
| 放弃待选择注册 | `POST …/tasks/{task_id}/cancel` | `cats:write` |
| 重试失败任务 | `POST …/tasks/{task_id}/retry` → 202 | `cats:write` / `recognition:write` |

这些图片读取接口可以取回查询原图或注册图，用于离线比对。读取本身不调用 `search`；
后续拿图片重新识别仍会产生调用，平台用量以控制台记录为准。

---
