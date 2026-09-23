const { getCallerOpenid } = require('./_helper.js')
const curdOpHandler = require('./curdOp.js')
const getAllSciHandler = require('./getAllSci.js')
const catRelationOpHandler = require('./catRelationOp.js')
const commentCheckHandler = require('./commentCheck.js')
const genBadgeCodeHandler = require('./genBadgeCode.js')
const userOpHandler = require('./userOp.js')
const sendMsgV2Handler = require('./sendMsgV2.js')
const managePhotoHandler = require('./managePhoto.js')
const updateCatHandler = require('./updateCat.js')
const getBadgeHandler = require('./getBadge.js')
const giveBadgeHandler = require('./giveBadge.js')
const getUserStatsHandler = require('./getUserStats.js')
const updateCatRatingHandler = require('./updateCatRating.js')
const getCatStatsHandler = require('./getCatStats.js')
const updateFollowCatsHandler = require('./updateFollowCats.js')
const vaccineOpHandler = require('./vaccineOp.js')
const manageRelationRulesHandler = require('./manageRelationRules.js')
const initVaccineTypesHandler = require('./initVaccineTypes.js')
const getURLHandler = require('./getURL.js')
const getTempCOSHandler = require('./getTempCOS.js')
const getAccessTokenHandler = require('./getAccessToken.js')
const deleteFilesHandler = require('./deleteFiles.js')
const deleteCosFilesHandler = require('./deleteCosFiles.js')
const isManagerHandler = require('./isManager.js')
const getCatLocationsHandler = require('./getCatLocations.js')
const getCatTrajectoryHandler = require('./getCatTrajectory.js')
const adoptionOpHandler = require('./adoptionOp.js')
const medicalOpHandler = require('./medicalOp.js')
const feedOpHandler = require('./feedOp.js')
const getAchievementRankHandler = require('./getAchievementRank.js')

const actionMap = {
    curdOp: curdOpHandler,
    getAllSci: getAllSciHandler,
    catRelationOp: catRelationOpHandler,
    commentCheck: commentCheckHandler,
    genBadgeCode: genBadgeCodeHandler,
    userOp: userOpHandler,
    sendMsgV2: sendMsgV2Handler,
    managePhoto: managePhotoHandler,
    updateCat: updateCatHandler,
    getBadge: getBadgeHandler,
    giveBadge: giveBadgeHandler,
    getUserStats: getUserStatsHandler,
    updateCatRating: updateCatRatingHandler,
    getCatStats: getCatStatsHandler,
    updateFollowCats: updateFollowCatsHandler,
    vaccineOp: vaccineOpHandler,
    manageRelationRules: manageRelationRulesHandler,
    initVaccineTypes: initVaccineTypesHandler,
    getURL: getURLHandler,
    getTempCOS: getTempCOSHandler,
    getAccessToken: getAccessTokenHandler,
    deleteFiles: deleteFilesHandler,
    deleteCosFiles: deleteCosFilesHandler,
    isManager: isManagerHandler,
    getCatLocations: getCatLocationsHandler,
    getCatTrajectory: getCatTrajectoryHandler,
    adoptionOp: adoptionOpHandler,
    medicalOp: medicalOpHandler,
    feedOp: feedOpHandler,
    getAchievementRank: getAchievementRankHandler,
}

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.5"
    }

    // ===== 安全加固：身份只能来自平台，客户端传入的 openid 一律忽略 =====
    // 背景：原实现中所有 handler 都直接用 ctx.args.openid 作为调用者身份，
    //       而 args 完全由请求方构造 —— 任何人只要改这个字段就能冒充任意用户/管理员。
    //       现改为：身份只从平台侧取（见 _helper.js#getCallerOpenid）。
    const claimedOpenid = ctx.args && ctx.args.openid

    const callerOpenid = await getCallerOpenid(ctx)
    if (claimedOpenid && callerOpenid && String(claimedOpenid) !== String(callerOpenid)) {
        // 正常客户端不会出现这种情况；一旦出现即代表有人在冒充，留痕便于排查
        console.log('[SECURITY] identity mismatch: claimed=' + claimedOpenid + ' real=' + callerOpenid +
            ' action=' + String(ctx.args && ctx.args.unionAction))
    }
    if (!ctx.args || typeof ctx.args !== 'object') {
        ctx.args = {}
    }
    ctx.args.openid = callerOpenid

    const action = ctx.args?.unionAction
    if (!action) {
        return { errMsg: 'no action specified', ok: false }
    }

    // 仅服务端内部使用、不允许客户端直接调用的动作：
    //   getAccessToken → 会把小程序 access_token 直接返回给调用方
    //   deleteFiles / deleteCosFiles → 删除 COS 文件
    // 这三个只被其它云函数通过 require() 内部调用，客户端从不直接调用 → 在路由层封死。
    const SERVER_ONLY_ACTIONS = { getAccessToken: true, deleteFiles: true, deleteCosFiles: true }
    if (SERVER_ONLY_ACTIONS[action]) {
        console.log('[SECURITY] blocked server-only action from client: ' + action)
        return { errMsg: 'forbidden: server-only action', ok: false }
    }

    const handler = actionMap[action]
    if (!handler) {
        return { errMsg: `unknown action: ${action}`, ok: false }
    }

    return await handler(ctx)
}
