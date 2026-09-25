// 医疗记录：疫苗、绝育、就诊、驱虫、伤病等（疫苗记录已并入医疗记录，旧 vaccine 集合数据可用 migrateVaccines 导入）
const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')

// 记录类型：vaccine 疫苗 / sterilize 绝育 / clinic 就诊 / deworm 驱虫 / injury 伤病 / other 其他
const MEDICAL_TYPES = ['vaccine', 'sterilize', 'clinic', 'deworm', 'injury', 'other']

module.exports = async (ctx) => {
  const openid = ctx.args.openid
  const operation = ctx.args.operation
  const db = ctx.mpserverless.db

  // 查询操作：所有用户可看（猫咪详情页展示时间线）
  if (operation === 'list') {
    const cat_id = ctx.args.cat_id
    if (!cat_id) {
      return { msg: '缺少猫咪ID', result: false }
    }
    const query = { cat_id: cat_id }
    if (ctx.args.type && MEDICAL_TYPES.includes(ctx.args.type)) {
      query.type = ctx.args.type
    }
    try {
      const { result: records } = await db.collection('medical').find(query, {
        sort: { record_date: -1 },
        limit: 200
      })
      return { msg: '获取成功', result: true, data: records }
    } catch (error) {
      return { msg: '获取失败', error, result: false }
    }
  }

  // 以下操作需要管理员权限（与疫苗管理同级）
  const is_manager = await isManagerHandler(createInternalCtx(ctx, {
    openid: openid,
    req: 2
  }))
  if (!is_manager) {
    return { msg: 'not a manager', result: false }
  }

  // 添加医疗记录
  if (operation === 'add') {
    const recordData = ctx.args.data
    if (!recordData || !recordData.cat_id || !recordData.type || !recordData.record_date) {
      return { msg: '缺少必要字段（猫咪、类型、日期）', result: false }
    }
    if (!MEDICAL_TYPES.includes(recordData.type)) {
      return { msg: '未知的记录类型', result: false }
    }

    recordData.created_by = openid
    recordData.created_at = new Date()
    recordData.updated_at = new Date()

    try {
      const { result } = await db.collection('medical').insertOne(recordData)

      // 绝育记录联动更新猫咪的绝育标记
      if (recordData.type === 'sterilize') {
        await db.collection('cat').updateOne({ _id: recordData.cat_id }, {
          $set: { sterilized: true }
        })
      }

      return { msg: '添加成功', result: true, data: result }
    } catch (error) {
      return { msg: '添加失败', error, result: false }
    }
  }

  // 更新医疗记录
  if (operation === 'update') {
    const record_id = ctx.args.record_id
    const recordData = ctx.args.data
    if (!record_id || !recordData) {
      return { msg: '缺少记录ID或数据', result: false }
    }
    recordData.updated_at = new Date()

    try {
      const { result } = await db.collection('medical').updateOne({
        _id: record_id
      }, {
        $set: recordData
      })
      return { msg: '更新成功', result: true, data: result }
    } catch (error) {
      return { msg: '更新失败', error, result: false }
    }
  }

  // 删除医疗记录
  if (operation === 'remove') {
    const record_id = ctx.args.record_id
    if (!record_id) {
      return { msg: '缺少记录ID', result: false }
    }
    try {
      const { result } = await db.collection('medical').deleteOne({
        _id: record_id
      })
      return { msg: '删除成功', result: true, data: result }
    } catch (error) {
      return { msg: '删除失败', error, result: false }
    }
  }

  // 导入旧版疫苗记录（vaccine 集合 → medical 集合，可重复执行，自动跳过已导入的）
  if (operation === 'migrateVaccines') {
    try {
      const { result: vaccines } = await db.collection('vaccine').find({}, { limit: 1000 })
      let migrated = 0, skipped = 0
      for (const v of (vaccines || [])) {
        const { result: exist } = await db.collection('medical').count({ vaccine_id: v._id })
        if (exist > 0) {
          skipped++
          continue
        }
        await db.collection('medical').insertOne({
          cat_id: v.cat_id,
          type: 'vaccine',
          title: v.vaccine_type || '疫苗',
          record_date: v.vaccine_date || '',
          hospital: v.location || '',
          description: v.remarks || '',
          expire_date: v.expire_date || '',
          next_vaccine_date: v.next_vaccine_date || '',
          vaccine_id: v._id,
          created_by: openid,
          created_at: new Date(),
          updated_at: new Date()
        })
        migrated++
      }
      return { msg: `导入完成：新增 ${migrated} 条，跳过已导入的 ${skipped} 条`, result: true, data: { migrated, skipped } }
    } catch (error) {
      return { msg: '导入失败', error, result: false }
    }
  }

  return { msg: '未知操作', result: false }
}
