# 开发待办问题清单

> 仅记录已知问题，按优先级粗排。完成一项就删除该项，不要在此堆叠历史。

## 高优先级

- [ ] **`cat._no` 并发重复**：`functionsEMAS/unionOp/updateCat.js:131` 先 count 查重再 insert，非原子；两个管理员同时新建猫会拿到同一编号。`_no` 用于猫编号搜索（genealogy.js:192）和小程序码 scene（mpcode.js:15），重复会串。修法：`_no` 加唯一索引 + 捕获 duplicate key 重试，而非给 `while(true)` 加次数上限。

- [ ] **achievement 系 vs badge 系双轨集合**：`achievement_def/achievement/achievement_material` 与 `badge/badge_def/badge_code` 功能高度重叠，需确认是否历史包袱、能否收敛（违反「新建集合前先查复用」）。

## 中优先级

- [ ] **派生字段落库**：`cat.photo_count_best` / `photo_count_total` 由 `timeTrigger/countPhoto.js` 定时统计后写回，属可计算数据。需决策：保留（有读性能理由则补文档）或改为读时聚合。

- [ ] **rank 缓存表**：`photo_rank` / `badge_rank` 由定时任务整表删重建（`getPhotoRank.js`、`getBadgeRank.js`），同样是可计算数据。需同上决策。

- [ ] **countPhoto N+1**：`countPhoto.js:53-70` 对每只猫 2 次 count + 1 次 updateOne，随猫数量线性放大。可改为一次聚合查询 + bulkWrite。

## 低优先级

- [ ] `random_string` 可能产出 `.`：`updateCat.js:183` 取 `Math.random().toString(36)` 末 2 位，极端情况得到 ".i"，编号出现 `c42.i`。改用固定字符集更稳。

- [ ] `functionsEMAS/temp/` 保留 4 个一次性迁移脚本（migrateToMedical、tempRenameCatNo、transferFromLaf、updateEMAS），暂按需求保留，上线稳定后再清理。

- [ ] 根目录 `themeChanging.py` 游离，按规范应归入 `wb_code/`，暂保留。

## 已处理（留档备查）

- [x] **材质背面图重算同步超时**：`manageAchievementCatalog.js` 原 `regenerateBacks` 在 `saveMaterial` 内串行处理全部引用徽章（每枚 2 次 COS 下载 + 2 次 PNG 渲染 + 2 次 COS 上传，约 1–3 秒），徽章多时撞函数超时，进度停在 `running`。已改为单批 3 枚 + 前端循环续跑（新接口 `regenerateMaterialBacks`），进度按「已完成枚数/总枚数」计，单批有失败即停并提示重试。

- [x] `wx-canvas-2d` 依赖被误删导致 poster 组件静默降级 → 已恢复（`866f46d`）
- [x] 孤儿页面 `pages/manage/photoManagement` → 已删除（`ccc6588`）
- [x] 业务 wxss 裸 hex 163 处 → 已全部收敛到 token（`9734b7a`）
