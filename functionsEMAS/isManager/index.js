module.exports = async (ctx) => {
    const openid = ctx.args?.openid
    const req = ctx.args?.req || 0;
    const user = await ctx.mpserverless.db.collection('user').findOne({ openid: openid });
    if (!user.result) {
        return false;
    }
    return user.result.manager && user.result.manager >= req;
}