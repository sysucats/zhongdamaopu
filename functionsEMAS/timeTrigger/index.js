// timeTrigger 云函数统一入口
// 5 个子 handler 并行跑：countPhoto + getBadgeRank + getPhotoRank + getTempCOS + photoProcess
//   - 前 4 个：统计/排行榜/缓存，与之前一致
//   - photoProcess：处理 photo_compressed 为空 + verified=true 的待处理照片
//     （异步从 OSS 下载 → jimp 压缩 + 双字体水印 → 两次上传 → 写库）
//
// 部署要求：EMAS 控制台 memory 1024MB + timeout 60s（photoProcess 需 ~1s/张）
// 触发方式：EMAS 定时器（建议 5-10 分钟一次），与本文件无关
// 历史版本：
//   v1.4 守门模式（runPhotoProcess 显式触发，前端测试用）— 已废弃
//   v1.5 移除守门，photoProcess 始终跑（与定时器触发器配套）

const countPhotoHandler = require('./countPhoto.js')
const getBadgeRankHandler = require('./getBadgeRank.js')
const getPhotoRankHandler = require('./getPhotoRank.js')
const getTempCOSHandler = require('./getTempCOS.js')
const photoProcessHandler = require('./photoProcess.js')

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.5"
    }

    return await Promise.all([
        countPhotoHandler(ctx),
        getBadgeRankHandler(ctx),
        getPhotoRankHandler(ctx),
        getTempCOSHandler(ctx),
        photoProcessHandler(ctx),
    ])
}
