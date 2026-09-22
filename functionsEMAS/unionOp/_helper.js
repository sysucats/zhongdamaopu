function createInternalCtx(parentCtx, args) {
    return {
        mpserverless: parentCtx.mpserverless,
        httpclient: parentCtx.httpclient,
        args: args || {},
    }
}

/**
 * 取「调用者真实身份」——唯一可信来源。
 *
 * 背景（2026-09-19 安全整改）：此前所有 handler 都拿 ctx.args.openid 当身份，
 * 而 args 完全由请求方构造，任何人改一个字段就能冒充管理员。
 *
 * 现在身份只从平台侧取：
 *   - 微信登录的会话： getInfo().user.oAuthUserId = openid（实测确认）
 *   - 匿名 / 未登录会话：没有 oAuthUserId → 返回 null（调用方应视为“未登录”）
 *   - 平台异常：重试一次仍失败 → 返回 null（fail closed，宁可拒绝也不放行）
 */
async function getCallerOpenid(ctx) {
    for (let i = 0; i < 2; i++) {
        try {
            const info = await ctx.mpserverless.user.getInfo()
            const u = (info && (info.user || (info.result && info.result.user))) || null
            const oid = u && (u.oAuthUserId || u.openId || u.openid)
            return oid ? String(oid) : null
        } catch (e) {
            if (i === 1) {
                console.log('[SECURITY] getCallerOpenid failed: ' + String((e && e.message) || e))
                return null
            }
        }
    }
    return null
}

module.exports = { createInternalCtx, getCallerOpenid }
