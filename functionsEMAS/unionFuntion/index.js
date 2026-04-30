const curdOpHandler = require('./curdOp.js')
const getAllSciHandler = require('./getAllSci.js')

const actionMap = {
    curdOp: curdOpHandler,
    getAllSci: getAllSciHandler,
}

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "unified_v1.0"
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
