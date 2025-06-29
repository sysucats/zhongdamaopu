module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const openid = ctx.args?.openid
  const op = ctx.args?.op
  switch (op) {
    case 'get': {
      // 获取用户，如果没有就新建一个
      const {
        result: user
      } = await ctx.mpserverless.db.collection('user').findOne({
        openid: openid
      });
      if (user) {
        return user;
      }
      const {
        result: count
      } = await ctx.mpserverless.db.collection('user').count({});
      let newUser = {
        'openid': openid
      };
      if (count === 0) {
        newUser['manager'] = 99;
      }
      await ctx.mpserverless.db.collection('user').insertOne(newUser);
      const {
        result
      } = await ctx.mpserverless.db.collection('user').findOne({
        openid: openid
      });
      return result;
    }
    case 'update': {
      const {
        result: targetUser
      } = await ctx.mpserverless.db.collection('user').findOne({
        openid: openid
      });
      if (targetUser.openid != openid) {
        return "Err, can only update your own info.";
      }
      var user = ctx.args.user;
      const _id = user._id;
      delete user._id; // 因为数据库不能更新_id
      delete user.openid; // 这个键唯一
      delete user.manager; // 不能用这个函数更新
      await ctx.mpserverless.db.collection('user').updateOne({
        _id: _id
      }, {
        $set: user
      });
      const {
        result
      } = await ctx.mpserverless.db.collection('user').findOne({
        openid: openid
      });
      return result;
    }
    case 'updateRole': {
      var user = ctx.args.user;
      const {
        result
      } = await ctx.mpserverless.db.collection('user').updateOne({
        openid: openid
      }, {
        $set: user
      });
      return result;
    }
    default: {
      return "unknown op: " + op;
    }
  }
};