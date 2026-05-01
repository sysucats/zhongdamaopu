function createInternalCtx(parentCtx, args) {
    return {
        mpserverless: parentCtx.mpserverless,
        httpclient: parentCtx.httpclient,
        args: args || {},
    }
}

module.exports = { createInternalCtx }
