module.exports = async (ctx) => {
  const openid = ctx.args.openid
  if (!openid || !ctx.args.updateCmd || !ctx.args.catId) {
    return false;
  }

  if (ctx.args.updateCmd == 'add') {
    const { result: cat } = await ctx.mpserverless.db.collection('cat').findOne({ _id: ctx.args.catId });
    if (!cat || cat.deleted) return false;
    await ctx.mpserverless.db.collection('user').updateOne({
      openid: openid
    }, {
      $addToSet: {
        followCats: ctx.args.catId
      }
    });
    await ctx.mpserverless.db.collection('cat').updateOne({
      catId: ctx.args.catId
    }, {
      $inc: {
        followCount: 1
      }
    });
  } else if (ctx.args.updateCmd == 'del') {
    await ctx.mpserverless.db.collection('user').updateOne({
      openid: openid
    }, {
      $pull: {
        followCats: ctx.args.catId
      }
    });
    await ctx.mpserverless.db.collection('cat').updateOne({
      catId: ctx.args.catId
    }, {
      $inc: {
        followCount: -1
      }
    });
  } else {
    return false;
  }
  return true;
}
