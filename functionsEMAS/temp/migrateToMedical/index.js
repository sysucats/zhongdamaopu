// 一次性云函数。run 一次尽可能完成；接近控制台调用时限时返回续跑游标。
const MAX_BATCH_SIZE = 100
const CONFIRM_TEXT = 'MIGRATE_TO_MEDICAL'
const RUN_BATCH_SIZE = 25
const RUN_BUDGET_MS = 45000
const DEWORM_TYPES = new Set(['体内驱虫', '体外驱虫'])

function toMedical(vaccine) {
  return {
    _id: `legacy-vaccine:${String(vaccine._id)}`,
    vaccine_id: vaccine._id,
    cat_id: vaccine.cat_id,
    type: DEWORM_TYPES.has(vaccine.vaccine_type) ? 'deworm' : 'vaccine',
    title: vaccine.vaccine_type || '疫苗',
    record_date: vaccine.vaccine_date,
    hospital: vaccine.location || '',
    description: vaccine.remarks || '',
    expire_date: vaccine.expire_date || '',
    next_vaccine_date: vaccine.next_vaccine_date || '',
    created_by: vaccine.created_by || 'legacy-migration',
    created_at: vaccine.created_at || new Date(),
    updated_at: new Date(),
  }
}

async function migrate(ctx) {
  const args = ctx.args || {}
  const db = ctx.mpserverless.db
  const { result: secretDoc } = await db.collection('app_secret').findOne()
  if (!secretDoc?.IMPORT_KEY) {
    return { success: false, error: '当前服务空间的 app_secret 未配置 IMPORT_KEY' }
  }
  if (typeof args.secret !== 'string' || !args.secret) {
    return { success: false, error: '缺少 secret 参数；请传入 app_secret.IMPORT_KEY 的实际值' }
  }
  if (args.secret !== secretDoc.IMPORT_KEY) {
    return { success: false, error: 'secret 与当前服务空间的 app_secret.IMPORT_KEY 不匹配' }
  }

  const mode = args.mode || 'preview'
  if (!['preview', 'apply', 'run'].includes(mode)) {
    return { success: false, error: '未知模式' }
  }
  if (['apply', 'run'].includes(mode) && args.confirm !== CONFIRM_TEXT) {
    return { success: false, error: '缺少写入确认' }
  }

  if (mode === 'run') {
    const now = ctx.now || Date.now
    const start = now()
    const batchSize = args.batchSize === undefined ? RUN_BATCH_SIZE : Number(args.batchSize)
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
      return { success: false, error: `batchSize 必须在 1 到 ${MAX_BATCH_SIZE} 之间` }
    }
    let offset = args.offset === undefined ? 0 : Number(args.offset)
    if (!Number.isInteger(offset) || offset < 0) {
      return { success: false, error: 'offset 必须是非负整数' }
    }
    let total
    const summary = { success: true, mode, scanned: 0, migrated: 0, reclassified: 0,
      alreadyPresent: 0, classificationConflicts: 0, pending: 0 }
    while (true) {
      const batch = await migrate({
        ...ctx,
        deadline: start + RUN_BUDGET_MS,
        args: { ...args, mode: 'apply', offset, batchSize },
      })
      if (!batch.success) {
        return { ...summary, success: false, error: batch.error, failedId: batch.failedId,
          total: batch.total ?? total, nextOffset: batch.nextOffset ?? offset, completed: false }
      }
      if (total === undefined) total = batch.total
      if (batch.total !== total || batch.nextOffset !== offset + batch.scanned) {
        return { ...summary, success: false, error: '旧集合数量或分页游标发生变化，请停止旧写入后核对',
          total, nextOffset: offset, completed: false }
      }
      summary.scanned += batch.scanned
      summary.migrated += batch.migrated
      summary.reclassified += batch.reclassified
      summary.alreadyPresent += batch.alreadyPresent
      summary.classificationConflicts += batch.classificationConflicts
      offset = batch.nextOffset
      if (!batch.hasMore) {
        return { ...summary, total, nextOffset: offset, completed: true }
      }
      if (now() - start >= RUN_BUDGET_MS) {
        return { ...summary, total, nextOffset: offset, completed: false,
          message: '接近云函数时限，请用相同参数并加上 nextOffset 继续运行' }
      }
    }
  }

  const batchSize = Number(args.batchSize || MAX_BATCH_SIZE)
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    return { success: false, error: `batchSize 必须在 1 到 ${MAX_BATCH_SIZE} 之间` }
  }
  const offset = args.offset === undefined ? 0 : Number(args.offset)
  if (!Number.isInteger(offset) || offset < 0) {
    return { success: false, error: 'offset 必须是非负整数' }
  }

  const { result: total } = await db.collection('vaccine').count({})
  if (!Number.isInteger(total) || total < 0 || offset > total) {
    return { success: false, error: '旧集合数量无效或 offset 超出范围' }
  }
  const { result: vaccines } = await db.collection('vaccine').find({}, {
    sort: { _id: 1 },
    skip: offset,
    limit: batchSize,
  })
  if (!Array.isArray(vaccines)) {
    return { success: false, error: '读取旧疫苗记录失败' }
  }

  // 迁移期间必须停止旧集合写入，才能保证 offset 分页稳定。
  const batch = vaccines
  const summary = {
    success: true,
    mode,
    scanned: 0,
    migrated: 0,
    reclassified: 0,
    wouldCorrect: 0,
    alreadyPresent: 0,
    classificationConflicts: 0,
    pending: 0,
    total,
    offset,
    nextOffset: offset,
    hasMore: offset + batch.length < total,
  }

  for (const vaccine of batch) {
    if (ctx.deadline && (ctx.now || Date.now)() >= ctx.deadline) {
      summary.hasMore = summary.nextOffset < total
      return summary
    }
    if (vaccine._id == null || !vaccine.cat_id || !vaccine.vaccine_date) {
      return {
        ...summary,
        success: false,
        error: '旧记录缺少 ID、猫咪 ID 或接种日期；请先处理该记录',
        failedId: String(vaccine._id),
      }
    }

    try {
      const { result: count } = await db.collection('medical').count({ vaccine_id: vaccine._id })
      if (count > 0) {
        if (DEWORM_TYPES.has(vaccine.vaccine_type)) {
          const id = `legacy-vaccine:${String(vaccine._id)}`
          const { result: record } = await db.collection('medical').findOne({ _id: id })
          if (record?.type === 'vaccine' && record.title === vaccine.vaccine_type &&
              String(record.vaccine_id) === String(vaccine._id)) {
            if (mode === 'preview') {
              summary.wouldCorrect++
            } else {
              await db.collection('medical').updateOne(
                { _id: id, vaccine_id: vaccine._id, type: 'vaccine', title: vaccine.vaccine_type },
                { $set: { type: 'deworm', updated_at: new Date() } },
              )
              const { result: updated } = await db.collection('medical').findOne({ _id: id })
              if (updated?.type !== 'deworm') throw new Error('分类更新后校验失败')
              summary.reclassified++
            }
          } else {
            summary.alreadyPresent++
            if (!record || record.type !== 'deworm' ||
                String(record.vaccine_id) !== String(vaccine._id)) {
              summary.classificationConflicts++
            }
          }
        } else {
          summary.alreadyPresent++
        }
      } else if (mode === 'preview') {
        summary.pending++
      } else {
        await db.collection('medical').insertOne(toMedical(vaccine))
        summary.migrated++
      }
    } catch (error) {
      // 失败时 offset 停在失败项之前；重试不会跳过失败项。
      return {
        ...summary,
        success: false,
        error: `处理失败：${error.message}`,
        failedId: vaccine._id,
      }
    }

    summary.scanned++
    summary.nextOffset++
  }

  return summary
}

module.exports = migrate
