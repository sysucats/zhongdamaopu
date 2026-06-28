# timeTrigger 云函数

EMAS 定时触发的统一入口，并行跑 5 个子 handler：

| handler | 作用 | 来源 |
|---|---|---|
| `countPhoto.js` | 统计每只猫的精选/总照片数 | 历史 |
| `getBadgeRank.js` | 徽章排行榜 | 历史 |
| `getPhotoRank.js` | 照片排行榜 | 历史 |
| `getTempCOS.js` | 临时 COS 缓存 | 历史 |
| `photoProcess.js` | **照片自动处理**（jimp 压缩+水印+上传+写库） | 本次新增 |

## 部署要求

**EMAS 控制台必须配置：**

| 配置项 | 值 | 原因 |
|---|---|---|
| memorySize | **1024 MB** | jimp + 双字体（opentype.js + svg2png-wasm）+ cos-sdk 同时加载，512MB 会 OOM |
| timeout | **60 s** | photoProcess 内部 `TOTAL_BUDGET_MS=60000`，预留 1-2s 给其他 4 个 handler |
| triggers | `0 */5 * * * * *`（每 5 分钟） | 与 photoProcess 60s 超时 + 100 张批量上限配套，避免扎堆 |

**不要在客户端 invoke 触发**——客户端走的是"试运行"按钮（前端 jimp），与本函数无关。

## 部署方式

1. 把 `timeTrigger.zip` 上传到 EMAS 控制台
2. 控制台配置 memory 1024MB + timeout 60s + timer trigger `0 */5 * * * * *`
3. 部署后等下一次定时触发（最长等 5 分钟）看 `processed` / `ok` 字段

## 关键设计

- **photoProcess 自动批量**：find `{photo_compressed:空, verified:true}` 最多 100 张，单张 ~1-2s
- **60s time budget + 10s 阈值**：剩余 < 10s 不再启动新照片，写 `stop_reason: "time_budget_exceeded"`
- **COS 私有桶签名**：`cos-nodejs-sdk-v5` getObjectUrl 拿 2h 临时签名
- **双字体路由**：opentype.js + svg2png-wasm，emoji 走 NotoEmoji，文字走 font.ttf
- **写库直接 mpserverless.db.updateOne**：跳过 unionOp.managePhoto 的 isManager 鉴权（定时器无 openid）

## 目录结构

```
timeTrigger/
├── index.js              # 5 个 handler 并行入口
├── countPhoto.js         # 历史
├── getBadgeRank.js       # 历史
├── getPhotoRank.js       # 历史
├── getTempCOS.js         # 历史
├── photoProcess.js       # 本次新增：照片处理
├── package.json          # 含 cos/opentype/svg2png-wasm 依赖
├── package-lock.json
├── fonts/
│   ├── font.ttf          # Alimama FangYuanTi VF（7.4MB，主字体）
│   └── NotoEmoji-VariableFont_wght.ttf  # NotoEmoji VF（1.9MB，emoji 字体）
├── node_modules/         # 含 cos/opentype/svg2png-wasm 及所有传递依赖
└── Readme.md             # 本文件
```

## 验证

- 本地 `node -c photoProcess.js` 通过
- 本地 `node -c index.js` 通过
- 静态 smoke（mock DB）：3 张待处理 photo，710ms 全部处理成功
- EMAS 部署后 deploy_test 返回 v1.5

## 升级日志

| 版本 | 变更 |
|---|---|
| v1.0-v1.1 | 历史：countPhoto 等 4 个 handler |
| v1.2 | 加 time_budget 防超时 |
| v1.3 | photoProcess 引入 opentype.js + svg2png-wasm 双字体 + cos 签名 |
| v1.4 | 加 runPhotoProcess 守门（手动测试模式） |
| v1.5 | **移除守门，正式上线：photoProcess 始终跑，配套 EMAS 定时器** |
