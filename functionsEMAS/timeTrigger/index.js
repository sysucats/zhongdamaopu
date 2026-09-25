// timeTrigger 云函数统一入口
// 5 个子 handler：
//   - countPhoto + getTempCOS + photoProcess：保持原频率（跟随 EMAS 定时器，约 5 分钟一次）
//   - getBadgeRank（徽章收集榜）+ getPhotoRank（拍照月榜）：每日 0 点更新（北京时间）
//     通过 setting 集合 rankDailyGate 记录上次运行日期，每天 0 点后第一次触发时执行
// 手动强制刷新榜单：EMAS 控制台试运行，参数 {"force_rank": true}
// 历史版本：
//   v1.4 守门模式（runPhotoProcess 显式触发，前端测试用）— 已废弃
//   v1.5 移除守门，photoProcess 始终跑
//   v1.6 徽章榜/拍照榜改为每日 0 点（北京时间）更新

const countPhotoHandler = require('./countPhoto.js')
const getBadgeRankHandler = require('./getBadgeRank.js')
const getPhotoRankHandler = require('./getPhotoRank.js')
const getTempCOSHandler = require('./getTempCOS.js')
const photoProcessHandler = require('./photoProcess.js')

const RANK_GATE_ID = 'rankDailyGate'

// 北京时间今日日期串（如 2026-09-18）
function beijingToday() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

async function rankAlreadyRanToday(ctx, today) {
    const { result: gate } = await ctx.mpserverless.db.collection('setting').findOne({ _id: RANK_GATE_ID })
    return !!(gate && gate.lastRunDate === today)
}

async function markRankRan(ctx, today) {
    await ctx.mpserverless.db.collection('setting').findOneAndUpdate(
        { _id: RANK_GATE_ID },
        { $set: { lastRunDate: today, lastRunAt: new Date() } },
        { upsert: true }
    )
}

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.6"
    }

    const tasks = [
        countPhotoHandler(ctx),
        getTempCOSHandler(ctx),
        photoProcessHandler(ctx),
    ]

    const today = beijingToday()
    const force = ctx.args && ctx.args.force_rank === true
    if (force || !(await rankAlreadyRanToday(ctx, today))) {
        // 今天还没算过（或被强制触发）：算榜 → 成功后才盖章，失败则下次触发自动重试
        tasks.push((async () => {
            const res = await Promise.all([
                getBadgeRankHandler(ctx),
                getPhotoRankHandler(ctx),
            ])
            await markRankRan(ctx, today)
            return res
        })())
    } else {
        tasks.push(Promise.resolve('rank skipped: already updated today'))
    }

    return await Promise.all(tasks)
}
