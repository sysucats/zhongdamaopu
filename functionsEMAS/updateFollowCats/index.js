module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const openid = ctx.args.openid
  if (!openid || !ctx.args.updateCmd || !ctx.args.catId) {
    return false;
  }

  if (ctx.args.updateCmd == 'add') {
    await ctx.mpserverless.db.collection('user').updateOne({
      openid: openid
    }, {
      $push: {
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