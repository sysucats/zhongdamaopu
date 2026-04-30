module.exports = async (ctx) => {
  const openid = ctx.args?.openid
  const op = ctx.args?.op
  switch (op) {
    case 'get': {
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
      delete user._id;
      delete user.openid;
      delete user.manager;
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
