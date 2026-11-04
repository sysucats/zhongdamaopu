# 旧疫苗记录一次性迁移

将 `vaccine` 集合中的记录迁入 `medical` 集合，保留原集合。此工具在 EMAS 控制台独立运行，不接入小程序和 `unionOp`。

## 准备

1. 备份数据库，暂停对 `vaccine` 集合的新增、修改和删除，直到迁移及核对完成。
2. 在仓库根目录执行以下命令，生成 `functionsEMAS/migrateToMedical.zip`，压缩包根目录仅包含 `index.js`：

   ```sh
   zip -j functionsEMAS/migrateToMedical.zip functionsEMAS/temp/migrateToMedical/index.js
   ```

3. 在 EMAS 创建名为 `migrateToMedical` 的云函数并上传 ZIP；选择 Node.js 20、256 MB 内存，超时设为 60 秒。
4. 将下方示例的 `<IMPORT_KEY>` 替换为当前服务空间 `app_secret` 集合中的 `IMPORT_KEY` 值。它不是小程序的 `space_secret`，不要将真实密钥写入仓库。

## 运行

先预览一批，默认最多 100 条，不写入数据库：

```json
{"mode":"preview","secret":"<IMPORT_KEY>"}
```

确认预览结果后执行迁移，单次调用会连续处理多个批次：

```json
{"mode":"run","secret":"<IMPORT_KEY>","confirm":"MIGRATE_TO_MEDICAL"}
```

接近 45 秒预算时，工具会在记录之间检查时间并返回进度；正在执行的数据库请求可能使返回时间延后。

- `success: true` 且 `completed: true`：扫描完成，仍需核对分类冲突。
- `completed: false` 且返回 `nextOffset`：在原参数中添加 `"offset": 返回的数字` 后继续运行。
- `success: false`：先处理 `error`；若返回 `failedId`，核对对应记录后，从 `nextOffset` 继续。当前版本失败时的统计可能少算已完成项，不代表没有写入。

记录关联由程序自动生成，无需手动填写 ID；重复运行会跳过已经迁入的记录。

## 分类与核对

“体内驱虫”和“体外驱虫”迁入后归为 `deworm`（驱虫），其他记录归为 `vaccine`（疫苗）。工具也会尝试修正能安全匹配的已迁入驱虫记录，只更新分类和更新时间。

- `pending`：预览中待新增的条数。
- `wouldCorrect`：预览中可自动修正分类的条数。
- `migrated`、`reclassified`：本次调用新增、修正的条数。
- `classificationConflicts`：无法自动确认分类的条数；不为 0 时需人工核对，即使 `completed: true` 也不能忽略。

完成后可通过 `preview` 和 `offset` 分批检查，确认每批 `pending`、`wouldCorrect`、`classificationConflicts` 均为 0，并抽查医疗管理页和猫咪详情页。核对无误后删除临时云函数，原 `vaccine` 集合保留。
