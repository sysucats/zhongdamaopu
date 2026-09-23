// 领养流程：申请、审核、状态跟踪
const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')

// 状态说明：
// pending   待审核（申请领养）
// reviewing 审核中（管理员已受理，猫咪仍可接受其他人申请）
// approved  已通过（猫咪标记为已领养）
// rejected  已拒绝
// cancelled 已撤销（申请人主动撤销）

module.exports = async (ctx) => {
  const openid = ctx.args.openid
  if (!openid) {
    return { msg: '未登录', result: false }
  }
  const operation = ctx.args.operation
  const db = ctx.mpserverless.db

  // 提交领养申请（普通用户）
  if (operation === 'apply') {
    const { cat_id, applicant_name, contact, reason } = ctx.args.data || {}
    if (!cat_id || !applicant_name || !contact || !reason) {
      return { msg: '缺少必要字段（猫咪、姓名、联系方式、申请理由）', result: false }
    }

    // 校验猫咪存在且处于"寻找领养中"
    const { result: cat } = await db.collection('cat').findOne({ _id: cat_id })
    if (!cat || cat.deleted === 1) {
      return { msg: '猫咪不存在', result: false }
    }
    if (cat.adopt !== 2) {
      return { msg: '这只猫猫目前不在寻找领养中', result: false }
    }

    // 防止重复提交进行中的申请（待审核或审核中）
    const { result: existCount } = await db.collection('adoption').count({
      cat_id: cat_id,
      applicant_openid: openid,
      status: { $in: ['pending', 'reviewing'] }
    })
    if (existCount > 0) {
      return { msg: '你已提交过申请，请耐心等待审核', result: false }
    }

    const now = new Date()
    const adoptionData = {
      cat_id: cat_id,
      cat_name: cat.name || '',
      applicant_openid: openid,
      applicant_name: applicant_name,
      contact: contact,
      reason: reason,
      status: 'pending',
      apply_time: now,
      review_time: null,
      reviewer_openid: null,
      review_note: '',
      timeline: [{
        status: 'pending',
        time: now,
        note: '提交领养申请',
        operator: openid
      }],
      created_at: now,
      updated_at: now
    }

    try {
      const { result } = await db.collection('adoption').insertOne(adoptionData)
      return { msg: '申请已提交，请等待管理员审核', result: true, data: result }
    } catch (error) {
      return { msg: '提交失败', error, result: false }
    }
  }

  // 我的申请列表（普通用户）
  if (operation === 'listMine') {
    try {
      const { result: list } = await db.collection('adoption').find({
        applicant_openid: openid
      }, {
        sort: { apply_time: -1 },
        limit: 100
      })
      return { msg: '获取成功', result: true, data: list }
    } catch (error) {
      return { msg: '获取失败', error, result: false }
    }
  }

  // 撤销申请（申请人本人，仅待审核状态可撤销）
  if (operation === 'cancel') {
    const adoption_id = ctx.args.adoption_id
    if (!adoption_id) {
      return { msg: '缺少申请ID', result: false }
    }
    const { result: adoption } = await db.collection('adoption').findOne({ _id: adoption_id })
    if (!adoption) {
      return { msg: '申请不存在', result: false }
    }
    if (adoption.applicant_openid !== openid) {
      return { msg: '只能撤销自己的申请', result: false }
    }
    if (adoption.status !== 'pending' && adoption.status !== 'reviewing') {
      return { msg: '当前状态不可撤销', result: false }
    }

    const now = new Date()
    const timeline = adoption.timeline || []
    timeline.push({
      status: 'cancelled',
      time: now,
      note: '申请人撤销申请',
      operator: openid
    })

    try {
      await db.collection('adoption').updateOne({ _id: adoption_id }, {
        $set: { status: 'cancelled', timeline: timeline, updated_at: now }
      })
      return { msg: '已撤销', result: true }
    } catch (error) {
      return { msg: '撤销失败', error, result: false }
    }
  }

  // 领养申请列表（管理员，可按状态/猫咪筛选）
  if (operation === 'list') {
    const is_manager = await isManagerHandler(createInternalCtx(ctx, {
      openid: openid,
      req: 1
    }))
    if (!is_manager) {
      return { msg: 'not a manager', result: false }
    }

    const query = {}
    if (ctx.args.status) {
      query.status = ctx.args.status
    }
    if (ctx.args.cat_id) {
      query.cat_id = ctx.args.cat_id
    }

    try {
      const { result: list } = await db.collection('adoption').find(query, {
        sort: { apply_time: -1 },
        limit: 200
      })
      return { msg: '获取成功', result: true, data: list }
    } catch (error) {
      return { msg: '获取失败', error, result: false }
    }
  }

  // 待审核申请数量（管理员）
  if (operation === 'countPending') {
    const is_manager = await isManagerHandler(createInternalCtx(ctx, {
      openid: openid,
      req: 1
    }))
    if (!is_manager) {
      return { msg: 'not a manager', result: false }
    }
    try {
      const { result: count } = await db.collection('adoption').count({ status: 'pending' })
      return { msg: '获取成功', result: true, data: count }
    } catch (error) {
      return { msg: '获取失败', error, result: false }
    }
  }

  // 审核申请（管理员）
  if (operation === 'review') {
    const is_manager = await isManagerHandler(createInternalCtx(ctx, {
      openid: openid,
      req: 2
    }))
    if (!is_manager) {
      return { msg: 'not a manager', result: false }
    }

    const { adoption_id, action, note } = ctx.args
    if (!adoption_id || !['approve', 'reject', 'processing'].includes(action)) {
      return { msg: '参数错误', result: false }
    }

    const { result: adoption } = await db.collection('adoption').findOne({ _id: adoption_id })
    if (!adoption) {
      return { msg: '申请不存在', result: false }
    }
    if (adoption.status !== 'pending' && adoption.status !== 'reviewing') {
      return { msg: '该申请已被处理', result: false }
    }
    // 开始审核只能从待审核发起
    if (action === 'processing' && adoption.status !== 'pending') {
      return { msg: '该申请已在审核中', result: false }
    }

    const now = new Date()
    const newStatus = action === 'approve' ? 'approved' : (action === 'processing' ? 'reviewing' : 'rejected')
    const defaultNote = action === 'approve' ? '审核通过' : (action === 'processing' ? '申请已受理，审核中' : '审核未通过')
    const timeline = adoption.timeline || []
    timeline.push({
      status: newStatus,
      time: now,
      note: note || defaultNote,
      operator: openid
    })

    try {
      await db.collection('adoption').updateOne({ _id: adoption_id }, {
        $set: {
          status: newStatus,
          review_time: now,
          reviewer_openid: openid,
          review_note: note || '',
          timeline: timeline,
          updated_at: now
        }
      })

      // 审核通过：猫咪标记为已领养，同猫其他待审核申请自动拒绝
      if (action === 'approve') {
        await db.collection('cat').updateOne({ _id: adoption.cat_id }, {
          $set: { adopt: 1 }
        })

        const { result: others } = await db.collection('adoption').find({
          cat_id: adoption.cat_id,
          status: { $in: ['pending', 'reviewing'] },
          _id: { $ne: adoption_id }
        })
        for (const other of (others || [])) {
          const otherTimeline = other.timeline || []
          otherTimeline.push({
            status: 'rejected',
            time: now,
            note: '该猫猫已被其他申请人领养',
            operator: openid
          })
          await db.collection('adoption').updateOne({ _id: other._id }, {
            $set: {
              status: 'rejected',
              review_time: now,
              reviewer_openid: openid,
              review_note: '该猫猫已被其他申请人领养',
              timeline: otherTimeline,
              updated_at: now
            }
          })
        }
      }

      return { msg: action === 'approve' ? '已通过，猫咪标记为已领养' : (action === 'processing' ? '已标记为审核中' : '已拒绝'), result: true }
    } catch (error) {
      return { msg: '审核操作失败', error, result: false }
    }
  }

  return { msg: '未知操作', result: false }
}
