module.exports = async (ctx) => {
  const openid = ctx.args?.openid
  // 2026-09-19 加固：身份取不到（未登录/匿名会话）时不得继续——
  // 否则 op:'get' 会新建一条 openid 为空的脏记录。
  if (!openid) {
    return { errMsg: 'not logged in', ok: false }
  }
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
      // 2026-09-19 加固：此分支原本无任何权限校验，任何人可自封 manager 99。
      // 现在：调用者必须已是最高管理员（>=99）；且任何人不得修改自己的 manager 等级。
      if (!openid) {
        return { errMsg: 'not logged in', ok: false };
      }
      const {
        result: me
      } = await ctx.mpserverless.db.collection('user').findOne({
        openid: openid
      });
      const myLevel = (me && me.manager) ? me.manager : 0;
      if (myLevel < 99) {
        return { errMsg: 'not a manager', ok: false };
      }
      var user = Object.assign({}, ctx.args.user || {});
      const targetOpenid = user.openid || openid;
      delete user.openid; // 不允许改身份键，否则会挪走别人的账号
      if (String(targetOpenid) === String(openid) && user.manager !== undefined) {
        return { errMsg: 'cannot change your own manager level', ok: false };
      }
      const {
        result
      } = await ctx.mpserverless.db.collection('user').updateOne({
        openid: targetOpenid
      }, {
        $set: user
      });
      console.log('[userOp] updateRole by ' + openid + ' -> ' + targetOpenid + ' fields=' + JSON.stringify(Object.keys(user)));
      return result;
    }
    default: {
      return "unknown op: " + op;
    }
  }
};
