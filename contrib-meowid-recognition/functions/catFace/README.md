# catFace 云函数

EMAS Serverless 的 MeowID 识猫参考实现。只使用 Node.js 内置 `https`、`crypto` 和 `url`，无需安装第三方依赖。运行依赖 `ctx.mpserverless.db` 和 `ctx.mpserverless.user.getInfo()`；其他云平台需要移植这些接口。

## 接口

所有 action 都要求有效平台登录身份。函数忽略客户端传入的 `openid`；管理员权限由 `user.manager >= 1` 决定。

| action | 用途 | 其他参数 | 权限 |
| --- | --- | --- | --- |
| `status` | 配置、COS 和绑定情况；`ping=true` 时读取远端个体列表 | `ping` 可选 | 登录用户 |
| `search` | 上传查询图，返回本地候选和剩余额度 | `photoBase64`；`catIdx` 可选 | 登录用户 |
| `quota` | 当前用户当天额度 | 无 | 登录用户 |
| `grantBonus` | 保留接口名，默认拒绝奖励 | 无 | 返回 `bonus_not_supported` |
| `enrollBatch` | 创建未绑定个体并上传已审核照片 | `limit`，默认 1，最多 10 | 管理员 |
| `enrollCat` | 给指定的一只猫补传注册图（含已建档的猫）；`dry_run=true` 只预览差异不产生请求 | `cat_id`（必填）、`dry_run`、`only_best`、`per_cat` | 管理员 |
| `syncTasks` | 同步最新 100 个任务到本地记录 | 无 | 管理员 |
| `bind` | 绑定本地猫与远端个体 | `cat_id`、`meowid_id` | 管理员 |
| `unbind` | 删除本地绑定和登记记录，保留远端个体 | `cat_id` | 管理员 |
| `saveConfig` | 更新白名单内的服务端配置项 | `data` | 管理员 |
| `diagnose` | 用登记图验证识别和 JSON 对照解析 | `limit`，建议 1 | 管理员 |
| `grantTestQuota` | 给本人增加当天测试额度 | `n`，1～50 | 管理员 |

`search` 区分 `catCount=0` 与 `unknown=true`：前者没有检测到猫，后者检测到猫但身份未确认。`recognizeResults[].score` 是相似度，不能显示成正确率。

## 数据与配置

需要项目已有的 `cat`、`photo`、`user`、`setting`、`app_secret` 集合。函数会给猫档案新增 `meowid_id`、`meowid_images` 等可选字段，并使用 `recognition_log` 记录每天的 `used`、`bonus`，不是每次请求的详细日志。

客户端应无法读取或写入 `app_secret` 和 `recognition_log`，只允许云函数访问。按所部署平台的权限规则配置。

必填服务端配置为 `MEOWID_PROJECT_ID` 和 `MEOWID_API_KEY`。配置项表见 [接入指南](../../docs/接入指南.md)。自动建档还需已有的 `OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_SECRET_ID`、`OSS_SECRET_KEY`；这些字段用于腾讯云 COS。

## 部署与前端调用

将 `index.js` 和 `package.json` 放在 ZIP 根目录，部署为 `catFace`。测试文件和文档不需要放进部署包。参考部署使用 512 MB 内存、120 秒超时；识别 HTTP 请求超时为 100 秒，给云函数留收尾时间。

小程序需要先完成微信登录。沿用项目 SDK 调用方式：

```js
const result = (await app.mpServerless.function.invoke('catFace', {
  action: 'search',
  photoBase64,
  // 若 setting 配置了兼容签名，还需 signature 和 timestamp。
})).result;
```

现有 `cloudApi.catFace()` 的 SDK 超时为 30 秒，采用本后端时需要与云函数预算协调：客户端超时应 ≥ 后端最坏耗时，且两者都要服从 **60s 平台上限**，否则客户端可能先超时。共享签名只是旧接口兼容措施，不能替代平台登录身份或服务端限流。

前端需要适配 `ok`、`code`、`msg`、`data.catCount`、`data.unknown`、`data.recognizeResults` 和 `quota`。这个贡献目录没有自动修改原识猫页。

## 自检与回归

本地测试不会联网，也不会读取真实配置：

```sh
npm --prefix contrib-meowid-recognition/functions/catFace test
```

部署后，从具有有效微信登录会话的 SDK 发起：

```json
{"action":"status","ping":true}
```

确认 `config.ready=true`，登记与本地绑定完成后再测试真实照片。管理员可调用：

```json
{"action":"diagnose","limit":1}
```

该诊断不修改本地档案或应用计数，但会用一张登记图最多发起两次第三方识别请求，可能收费并超出单次云函数时间预算。不能用匿名的控制台调用加上管理员 `openid` 绕过身份校验；控制台缺少真实微信会话时，请通过管理员登录的小程序调用。

响应解析现已统一使用 HTTP 包装中的 `.body`。成功 HTTP 响应缺少非负整数 `cat_count` 时返回 `invalid_response`，不会误报无猫或扣次数。不要仅凭 `status` 成功就认为整个识别链路已经可用。

## 运行限制

每日额度检查与扣减不在同一原子操作中，并发请求可能超过额度；奖励接口尚未实现可信广告核验。生产采用前应完善原子额度预留、请求限流和费用控制。`syncTasks` 只取最新 100 个任务和前 200 只猫；批量建档只选未绑定猫，**已绑定但缺少参考图的用 `enrollCat` 按猫补传**（支持 `dry_run` 先预览差异，已登记的照片自动跳过、不会重复建个体或重复计费）。批量建档受双重时间闸门约束：软预算 `MEOWID_ENROLL_DEADLINE_SEC`（默认 40 秒，上限 50）下沉到每张注册图之间检查，硬保护线 52 秒（`ENROLL_HARD_DEADLINE_MS`）则在每个网络步骤（建个体 / 下载 / 上传）开工前核验「最坏耗时塞不塞得进剩余时间」，塞不进就不开工——保证云函数永远在 **EMAS 客户端调用 60 秒硬上限**之前自行返回，不会被平台强杀成 `FunctionTimeout`。每张图处理完立即落库，避免超时丢记录或重复上传。注册图默认只取「精选」照片（`MEOWID_ENROLL_ONLY_BEST`，写 `'0'` 可关闭）。
