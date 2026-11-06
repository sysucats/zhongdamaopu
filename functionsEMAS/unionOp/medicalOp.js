// 医疗记录：疫苗、绝育、就诊、驱虫、伤病等
const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')

// 记录类型：vaccine 疫苗 / sterilize 绝育 / clinic 就诊 / deworm 驱虫 / injury 伤病 / other 其他
const MEDICAL_TYPES = ['vaccine', 'sterilize', 'clinic', 'deworm', 'injury', 'other']

async function syncSterilization(db, catId) {
  const { result: records } = await db.collection('medical').find({
    cat_id: catId,
    type: 'sterilize'
  }, {
    sort: { record_date: 1 },
    limit: 1
  })
  const firstRecord = records && records[0]
  const recordDate = firstRecord ? new Date(firstRecord.record_date) : null
  const sterilizedTime = recordDate && !Number.isNaN(recordDate.getTime())
    ? recordDate.toISOString()
    : null
  await db.collection('cat').updateOne({ _id: catId }, {
    $set: { sterilized: !!firstRecord, sterilized_time: sterilizedTime }
  })
}

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

      if (recordData.type === 'sterilize') {
        await syncSterilization(db, recordData.cat_id)
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
    if (recordData.type && !MEDICAL_TYPES.includes(recordData.type)) {
      return { msg: '未知的记录类型', result: false }
    }
    if (recordData.cat_id !== undefined) {
      return { msg: '不能修改记录所属猫咪', result: false }
    }
    recordData.updated_at = new Date()

    try {
      const { result: oldRecord } = await db.collection('medical').findOne({ _id: record_id })
      if (!oldRecord) return { msg: '记录不存在', result: false }
      const wasSterilization = oldRecord.type === 'sterilize'
      const catId = oldRecord.cat_id
      const { result } = await db.collection('medical').updateOne({
        _id: record_id
      }, {
        $set: recordData
      })
      if (wasSterilization || recordData.type === 'sterilize') {
        await syncSterilization(db, catId)
      }
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
      const { result: oldRecord } = await db.collection('medical').findOne({ _id: record_id })
      if (!oldRecord) return { msg: '记录不存在', result: false }
      const { result } = await db.collection('medical').deleteOne({
        _id: record_id
      })
      if (oldRecord.type === 'sterilize') {
        await syncSterilization(db, oldRecord.cat_id)
      }
      return { msg: '删除成功', result: true, data: result }
    } catch (error) {
      return { msg: '删除失败', error, result: false }
    }
  }

  return { msg: '未知操作', result: false }
}
