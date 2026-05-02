const countPhotoHandler = require('./countPhoto.js')
const getBadgeRankHandler = require('./getBadgeRank.js')
const getPhotoRankHandler = require('./getPhotoRank.js')
const getTempCOSHandler = require('./getTempCOS.js')

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.0"
    }

    return await Promise.all([
        countPhotoHandler(ctx),
        getBadgeRankHandler(ctx),
        getPhotoRankHandler(ctx),
        getTempCOSHandler(ctx),
    ])
}
