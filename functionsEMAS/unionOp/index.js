const curdOpHandler = require('./curdOp.js')
const getAllSciHandler = require('./getAllSci.js')
const catRelationOpHandler = require('./catRelationOp.js')
const commentCheckHandler = require('./commentCheck.js')
const genBadgeCodeHandler = require('./genBadgeCode.js')
const userOpHandler = require('./userOp.js')
const sendMsgV2Handler = require('./sendMsgV2.js')
const getMpCodeHandler = require('./getMpCode.js')
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

const actionMap = {
    curdOp: curdOpHandler,
    getAllSci: getAllSciHandler,
    catRelationOp: catRelationOpHandler,
    commentCheck: commentCheckHandler,
    genBadgeCode: genBadgeCodeHandler,
    userOp: userOpHandler,
    sendMsgV2: sendMsgV2Handler,
    getMpCode: getMpCodeHandler,
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
}

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.0"
    }

    const action = ctx.args?.unionAction
    if (!action) {
        return { errMsg: 'no action specified', ok: false }
    }

    const handler = actionMap[action]
    if (!handler) {
        return { errMsg: `unknown action: ${action}`, ok: false }
    }

    return await handler(ctx)
}
