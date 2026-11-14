# importBadges · 一次性导入（用完即删）

把 5 档材质 + 25 枚成就徽章写入数据库，并上传正面图到 COS、生成背面图与 3D 轮廓。
数据由 `wb_code/buildBadgeImport.cjs` 从 `badgeAssets/` 生成（`data.js`），改图后重跑该脚本即可。

## 为什么要单独建函数

本地没有 COS 密钥，也没有直连 EMAS 数据库的通道：图片必须先传到自有 COS 桶（`achievement/` 目录），
写入权限在云端的 `app_secret` 里，所以只能在云函数内完成。本函数复用 `achievementBack.js` 的
上传 + 背面生成逻辑，与生产代码同一套算法。

**运行时不读本地文件**：30 张图在打包前由 `wb_code/buildBadgeImport.cjs` 转成 base64 写入 `data.js`，
函数内用 `Buffer.from(b64, 'base64')` 还原后上传 COS。`index.js` 与复用模块均无 `fs` / `__dirname` 依赖，
整个 zip 自包含；本地 `badgeAssets/` 只参与构建。

## 部署

1. EMAS 控制台 → 云函数 → 新建函数，名称 `importBadges`
2. 上传 `importBadges.zip`（含 node_modules，约 9.4MB）
3. 运行环境 Node.js，超时建议调到 **60 秒**（25 枚背面生成需要时间），内存 512MB

## 调用顺序

| 步骤 | 参数 | 作用 |
|---|---|---|
| 0 | `{}` | 预览：返回材质库/徽章库现状、将要新建/认领的条目，不写任何数据 |
| 1 | `{"apply": true, "limit": 8}` | 上传 5 张材质 + 25 张正面，写记录，并生成最多 8 枚背面 |
| 2 | `{"apply": true, "stage": "assets", "limit": 25}` | 只补背面/3D，已完成自动跳过；返回 `assets.hasMore` 为 false 即齐 |
| 3 | `{"apply": true, "stage": "activate"}` | 25 枚全部切 active（**确认阶梯分组正确后再执行**） |

`stage` 可取 `all`（默认）/ `materials` / `badges` / `assets` / `activate`。
全部操作幂等：重跑只会更新，不会产生重复记录；已上线的徽章不会被覆盖回草稿。

## 认领机制（已有手工录入时）

若库里已存在手工上传的材质或手工新建的徽章，函数会**原地接管**而非重复新建：

- 材质匹配顺序：`key` 精确命中 → 名称精确/包含 → 名称带 `v1`~`v5` 序号（前端上传命名习惯）
  - 命中后复用原 `_id`，把 `key` 归一到 `wood/bronze/silver/gold/jade`，`name` 归一到规范名，图片改写为本函数的规范化上传
  - `key` 被改写时，同步把引用旧 key 的徽章 `materialKey` 一起改掉
- 徽章匹配顺序：`key` 精确命中 → 同系列同名
  - 命中且 `status: draft`、无持有者（`achievement` 集合无该 key 记录）→ 原地更新规则与图片，`key` 归一
  - 命中但**已上线或已有人获得** → 跳过，规则不动，只在 `report.badges` 里标 `skipped-locked`

预览返回的 `materials.willAdopt` / `badges.willAdopt` / `badges.locked` 即为上述三种情况的清单。

## 导入内容

- 材质 key：`wood` 木质 / `bronze` 桃铜 / `silver` 浅银 / `gold` 暖浅金 / `jade` 翡翠
- 徽章 key：`ach_{metric}_lv{1~5}`，25 枚全部 `status: draft`，`sort` 1~25
- 系列：猫口普查（view）/ 吸猫（follow）/ 留影（photo）/ 便利贴（comment）/ 点赞之交（like）
- `description` 留空，由 `METRICS.desc` 按阈值自动生成

## 完成后的清理

确认数据无误后：

1. 删除云函数 `importBadges`
2. 删除本地目录 `functionsEMAS/temp/importBadges/`（含 11MB 的 data.js 与 node_modules，勿提交）

## 已知限制

- 单次 `limit` 过大会超时；超时不影响已完成的条目，直接重跑续作即可
- 背面生成依赖 COS 出网，失败会在 `assets.failed` 里列出 key 与错误，重跑会重试
