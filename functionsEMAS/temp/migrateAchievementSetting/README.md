# migrateAchievementSetting · 成就数据迁出 setting（用完即删）

成就编号计数器原先每枚徽章一条存在 `setting`（`_id: achievement_serial:<key>`），素材生成进度每枚徽章/材质一条（`achievement_assets:<key>`）。新版 `unionOp` 改为：

| 集合 | `_id` | 内容 |
|---|---|---|
| `achievement_serial` | 徽章 key | `seq`、`ready` 及租约锁字段，语义不变 |
| `achievement_job` | 徽章 key / `material:<材质 key>` | 素材生成进度，仅供管理端轮询 |

`setting` 只保留 `achievement_display` 等全局配置。

为什么新建集合：计数器是按徽章增长的业务数据（不能丢、不能重号），进度是临时任务状态，两者都不是全局配置；不并入 `achievement_def`：新建徽章时编号锁要在徽章文档写入之前拿到，且 `achievement_def` 会整条下发给前端（公开目录与后台列表），计数器和租约字段不应随之外泄。

## 方式

一次性迁移：新版 `unionOp` 只读写新集合，不再回退读 `setting`。旧进度是临时状态，不迁移，清理时直接删除。前端接口返回结构不变。

## 部署顺序（先部署、再立即迁移）

发奖无法暂停，所以**不能先迁移再部署**：迁移后、部署前旧版仍在 `setting` 里推进编号，新集合拿到的是过期 `seq`，部署后会发出重复编号。

反过来先部署是安全的：新版首次给某枚徽章加锁时，若新集合没有计数器，会从 `achievement` 里已发最大编号续号建档，编号以发奖记录为准，不会重号。代价只是部署到迁移之间这几分钟，后台会把这些徽章显示为「历史编号未就绪」（新档 `ready=false`），「全部上线」会暂时拦下它们，迁移后恢复。

1. EMAS 控制台新建集合 `achievement_serial`、`achievement_job`（若服务空间不会自动建集合）；备份 `setting`。
2. 新建云函数 `migrateAchievementSetting`，上传 `zip -j functionsEMAS/migrateAchievementSetting.zip functionsEMAS/temp/migrateAchievementSetting/index.js`，超时 60 秒。先跑一次**预览**，确认能读到旧文档。
3. 部署新版 `unionOp`。避开发奖高峰：新旧实例短暂并存时两边的编号锁不互斥。
4. 立即执行**迁移**：缺的建档，seq 取 max(旧 seq, 已发最大编号)；新版已先建的档只抬高 seq、补回 `ready`，从不调低。
5. 再**预览**，应显示 `pendingMigrate: 0`、`unsafeToDelete: []`；抽查后台编号状态和一次发奖编号。
6. 确认无误后执行**清理**（不可撤销），然后删除本云函数。

`<IMPORT_KEY>` 为 `app_secret` 集合中的 `IMPORT_KEY`：

| 步骤 | 参数 | 作用 |
|---|---|---|
| 预览 | `{"secret":"<IMPORT_KEY>"}` | 列出每枚徽章旧 `seq`、已发最大编号、新集合 `seq`，不写数据 |
| 迁移 | `{"secret":"<IMPORT_KEY>","mode":"migrate","confirm":"MIGRATE_ACHIEVEMENT_SERIAL"}` | 写入 `achievement_serial` |
| 清理 | `{"secret":"<IMPORT_KEY>","mode":"cleanup","confirm":"CLEAN_ACHIEVEMENT_SETTING"}` | 删除 `setting` 中的 `achievement_assets:*`，以及新集合已覆盖的 `achievement_serial:*`；未覆盖的跳过并列在 `skipped` |

各步可重复执行。迁移时若某计数器正被并发推进，该条不改，再预览一次、重跑迁移即可。

## 注意

`temp/rebaseAchievements`、`temp/importBadges` 自带 `achievementSerial.js` 副本。`importBadges` 已同步为新版；任何仍直接写 `setting` 计数器的一次性脚本，须在部署新版 `unionOp` 之前跑完（之后再按上面步骤迁移），或改为写 `achievement_serial`（`_id` 为徽章 key）。
