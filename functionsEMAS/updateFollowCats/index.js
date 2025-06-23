module.exports = async (ctx) => {
    const openid = ctx.args.openid
    if (!openid || !ctx.args.updateCmd || !ctx.args.catId) {
        console.log("参数不全");
        return false;
    }

    if (ctx.args.updateCmd == 'add') {
        await ctx.mpserverless.db.collection('user').updateOne({ openid: openid }, { $push: { followCats: ctx.args.catId } });
        await ctx.mpserverless.db.collection('cat').updateOne({ catId: ctx.args.catId }, { $inc: { followCount: 1 } });
    } else if (ctx.args.updateCmd == 'del') {
        await ctx.mpserverless.db.collection('user').updateOne({ openid: openid }, { $pull: { followCats: ctx.args.catId } });
        await ctx.mpserverless.db.collection('cat').updateOne({ catId: ctx.args.catId }, { $inc: { followCount: -1 } });
    } else {
        return false;
    }
    return true;
}