module.exports = async (ctx) => {
    const { catId, badgeDef, openid } = ctx.args
    const { result: badge } = await ctx.mpserverless.db.collection('badge').findOne({ badgeDef: badgeDef, _openid: openid, catId: null });
    if (!badge) {
        return { ok: false };
    }
    await ctx.mpserverless.db.collection('badge').updateOne({ _id: badge._id }, { $set: { catId: catId, givenTime: new Date() } });
    return { ok: true };
}