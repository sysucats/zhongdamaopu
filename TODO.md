# 开发待办问题清单

> 仅记录已知问题，按优先级粗排。完成一项就删除该项，不要在此堆叠历史。

## 高优先级

- [ ] **`cat._no` 并发重复**：`functionsEMAS/unionOp/updateCat.js:131` 先 count 查重再 insert，非原子；两个管理员同时新建猫会拿到同一编号。`_no` 用于猫编号搜索（genealogy.js:192）和小程序码 scene（mpcode.js:15），重复会串。修法：`_no` 加唯一索引 + 捕获 duplicate key 重试，而非给 `while(true)` 加次数上限。

- [ ] **achievement 系 vs badge 系双轨集合**：`achievement_def/achievement/achievement_material` 与 `badge/badge_def/badge_code` 功能高度重叠，需确认是否历史包袱、能否收敛（违反「新建集合前先查复用」）。

## 中优先级

- [ ] **rank 缓存表**（暂缓，暂不修）：`photo_rank` / `badge_rank` 由定时任务整表删重建（`getPhotoRank.js`、`getBadgeRank.js`），属可计算数据。暂不动的理由：每天 0 点才跑一次，不是 countPhoto 那种 12 倍放大；且读取端是 `photoRank` / `badgeRank` 组件，改读时计算要把排序+分页搬到客户端。等榜单数据量或刷新频率上来再处理。

- [ ] **photoProcess 失败照片会永久占名额，可致流水线停摆**：`photoProcess.js:189` 取待处理照片用 `photo_compressed 为空 + verified:true`、`limit: 6`、无排序、无失败标记。处理失败的照片条件仍成立，下一轮（5 分钟后）仍被优先取到。累积 6 张永久失败图（COS 404 / 文件损坏 / 超大图 OOM）后，新照片永远轮不到，表现为「新上传的照片一直不出压缩图和水印图」，且无告警。修法：失败时写 `photo_process_error` + `retry_count`，查询加 `retry_count: { $lt: 3 }` 并跳过；或用 `$or` 把失败过的排到后面。

- [ ] **photoProcess 与 countPhoto / rank 任务共享同一个函数超时**：`timeTrigger/index.js:43` 用 `Promise.all` 并发跑三个 handler，photoProcess 自己的预算是 `TOTAL_BUDGET_MS = 60000`、按自身 `baseTime` 计，但三个任务实际共享同一次调用的执行时长上限。rank 整表重建那天（0 点后第一次触发）风险最高，可能整体被强杀、留下半完成的榜单。建议 photoProcess 预算下调（如 45s）或 rank 任务错峰。

- [ ] **弹窗/遮罩类组件 5 个平行实现**：`popup`(73 行)、`newsModal`(122)、`badgeModal`(78)、`mask`(29)、`profilePrompt`(12) 各自维护遮罩+弹出逻辑，未收敛到统一 popup。需人工确认功能差异后决定是否合并（checklist §5）。

## 低优先级

- [ ] `random_string` 可能产出 `.`：`updateCat.js:183` 取 `Math.random().toString(36)` 末 2 位，极端情况得到 ".i"，编号出现 `c42.i`。改用固定字符集更稳。

- [ ] **压图/水印图标不上 fileId，删除时成 COS 孤儿文件**：`photoProcess.js` 的 `uploadBuffer` 返回 `fileId: ''`，于是 `photo.photo_compressed_id` / `photo_watermark_id` 被写成空串；`managePhoto.js:129` 判断 `if (photo.photo_compressed_id)` 为假，删除照片时只删了原图，压缩图和水印图永久残留。慢性存储泄漏。修法：改为按 URL 删除，或让 `uploadBuffer` 返回可用 id。

- [ ] **getTempCOS 每小时空刷 11 次 STS**：`getTempCOS.js` 缓存 `expiredAt = now + 3600`，但定时任务每 5 分钟调用一次且带 `triggerName`，`triggerName` 存在时直接跳过缓存检查重新获取。每小时实际调用 12 次，11 次是浪费。修法：定时触发也走缓存判断，或把定时频率降到与过期时间匹配。

- [ ] **热度公式在 poster.js 写死 10**：`poster.js:217` `const photoPopWeight = 10`（注释还留着「photoPopWeight如何获取？」），而分类列表、详情页都从 `setting.photoPopWeight` 读。改后台配置后海报上的热度会与其他页面不一致。修法：海报数据传入时一并带上该权重。

- [ ] `functionsEMAS/temp/` 保留 4 个一次性迁移脚本（migrateToMedical、tempRenameCatNo、transferFromLaf、updateEMAS），暂按需求保留，上线稳定后再清理。

- [ ] 根目录 `themeChanging.py` 游离，按规范应归入 `wb_code/`，暂保留。

## 已处理（留档备查）

- [x] **派生字段 `photo_count_*` 保留（已决策）**：虽然可由 photo 集合算出，但读取点有 4 处（分类列表、详情页、海报组件、识别的随机选取），其中分类列表是客户端直连数据库，改读时计算要给每页多加一次聚合、且会让旧版客户端显示冻结。故保留字段、只优化维护方式；rank 缓存表暂缓，见中优先级条目。

- [x] **countPhoto N+1 + 12 倍重复计算**：原实现逐只猫 2 次 count + 1 次 update，且定时器 5 分钟一轮配 1 小时窗口，同一次照片变更会被重复重算约 12 次。已改为分批聚合 + 并发回写，并用 `photo_count_at` 水位（记录上次计数时 mphoto 的值）保证一次变更只算一次。SDK 无 `bulkWrite`，故用并发 `updateOne`（限 10）替代。
- [x] **材质背面图重算同步超时**：`manageAchievementCatalog.js` 原 `regenerateBacks` 在 `saveMaterial` 内串行处理全部引用徽章（每枚 2 次 COS 下载 + 2 次 PNG 渲染 + 2 次 COS 上传，约 1–3 秒），徽章多时撞函数超时，进度停在 `running`。已改为单批 3 枚 + 前端循环续跑（新接口 `regenerateMaterialBacks`），进度按「已完成枚数/总枚数」计，单批有失败即停并提示重试。

- [x] `wx-canvas-2d` 依赖被误删导致 poster 组件静默降级 → 已恢复（`866f46d`）
- [x] 孤儿页面 `pages/manage/photoManagement` → 已删除（`ccc6588`）
- [x] 业务 wxss 裸 hex 163 处 → 已全部收敛到 token（`9734b7a`）
