# MeowID 云端识猫参考方案

提供一个可选的 MeowID 后端，供猫谱的 EMAS 版本接入拍照识猫。照片由云函数发送到第三方服务，返回的个体 ID 通过 `cat.meowid_id` 映射为本地猫谱 ID。API Key 保留在服务端。

本目录包含接入文档、云函数和离线回归测试。采用时需要部署新函数并适配识猫页；仅复制目录不会启用功能，也不会替换项目现有识猫服务。

## 功能与依赖

- 识别单猫和多猫，保留 `catCount`、`unknown`、候选、相似度和检索路由。
- 管理员批量创建个体、上传已审核照片、同步登记任务和手动绑定本地档案。
- 每日识别额度；成功检测到猫才扣次数，无猫和上游错误不扣次数。
- 配置状态检查、管理员诊断与当天测试额度。

参考实现使用 Node.js 内置模块，没有第三方 npm 依赖。它依赖 EMAS 的 `ctx.mpserverless` 数据库与登录接口，以及猫谱的 `cat`、`photo`、`user`、`setting`、`app_secret` 集合。新建 `recognition_log` 存放每日计数。自动建档还依赖项目的腾讯云 COS 配置。

其他平台需要改写入口、数据库接口、身份验证和密钥读取，不能直接上传这个函数运行。

## 快速开始

1. 按 [接入指南](docs/接入指南.md) 创建 MeowID 项目和具有所需 scope 的 API Key。
2. 在服务端 `app_secret` 配置 `MEOWID_PROJECT_ID` 和 `MEOWID_API_KEY`，关闭客户端对密钥集合的访问。
3. 按 [函数部署说明](functions/catFace/README.md) 部署 `catFace`，设置 120 秒超时。
4. 登记参考照片，确认任务完成，并绑定 `cat.meowid_id`。
5. 适配前端结果和额度提示，用已登记猫咪的另一张照片验收。

接口字段及任务状态见 [API 速查](docs/MeowID-API-速查.md)。

## 身份与费用

调用者身份沿用项目当前云函数的处理方式：从 `ctx.mpserverless.user.getInfo()` 读取平台会话，不信任 `args.openid`；匿名或读取身份失败时拒绝调用。管理操作还需要数据库中的管理员权限。

`grantBonus` 默认返回 `bonus_not_supported`。部署者接入可信的广告完成核验后再实现奖励。

每日计数是应用额度，不是第三方账单。并发请求的额度检查与扣减目前分两步，不能当作严格的费用上限；生产部署应另加请求限流、原子额度预留和供应商预算控制。

查询图和登记图会上传到第三方平台，识别与登记可能产生费用，价格及数据处理规则以服务商当前说明为准。`diagnose` 也会发起真实识别请求；它不写本地档案，但会消耗第三方用量。

## 响应解析修复与验证

HTTP 客户端返回 `{ body, headers, status }`。识别字段位于 `body`，直接把外层包装传给解析器会将真实命中错误解析成零只猫。当前实现统一读取 `response.body`，校验 `cat_count`，异常响应返回 `invalid_response`；JSON 对照诊断也读取 `.body`。

离线测试模拟 HTTPS 和数据库，覆盖命中映射、未知候选、无猫不扣次数、HTTP 错误、无效响应及诊断解析，并验证身份和权限边界：

```sh
npm --prefix contrib-meowid-recognition/functions/catFace test
```

响应解析修复已在一套 EMAS 部署上使用真实含猫照片验证：`catCount=1`、`route=face`、`unknown=false`，最高相似度约 `0.9059`，成功映射本地猫谱 ID。这是一次链路验证，不代表总体识别准确率；本目录新增的权限处理通过离线测试验证，仍需在采用者自己的 EMAS 登录会话上验收。

## 目录

```text
contrib-meowid-recognition/
├── README.md
├── docs/
│   ├── 接入指南.md
│   └── MeowID-API-速查.md
└── functions/catFace/
    ├── index.js
    ├── package.json
    ├── README.md
    └── tests/regression.cjs
```

## 限制

本贡献提供后端参考实现，未提供前端管理界面，也未实现删除远端个体、重新选主图和失败任务重试。`syncTasks` 目前只读取最新 100 个任务和最多 200 只猫，更多记录需要扩展分页。`enrollBatch` 只选未绑定猫，已绑定但没有可用参考图的猫需要人工补传；请先在少量猫咪上验证登记质量、识别效果和实际费用。

本贡献遵循项目的 MPL-2.0 协议。MeowID 为第三方服务，本目录仅调用其公开 API。