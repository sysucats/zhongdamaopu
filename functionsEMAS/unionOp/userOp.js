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
      // 同一微信身份使用固定主键，依赖已有 _id 唯一约束原子创建。
      // 旧用户沿用上方已查到的原记录，不改变历史主键。
      await ctx.mpserverless.db.collection('user').updateOne(
        { _id: `wx_${openid}` },
        { $setOnInsert: newUser },
        { upsert: true }
      );
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
      if (!targetUser || (ctx.args.user?._id && ctx.args.user._id !== targetUser._id)) {
        return { ok: false, errMsg: 'can only update your own info' };
      }
      await updateUser(ctx, ctx.args.user || {}, targetUser._id, true);
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
      const input = ctx.args.user || {};
      var user = pick(input, ['manager', 'role']);
      const targetOpenid = input.openid || openid;
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

function pick(input, fields) {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
}

// 资料只写展示字段；权限由最高管理员维护，统计字段不接受客户端更新。
async function updateUser(ctx, input, targetId, profileOnly = false) {
  const db = ctx.mpserverless.db, openid = ctx.args.openid;
  const { result: caller } = await db.collection('user').findOne({ openid });
  if (!caller) return { ok: false, errMsg: 'user not found' };
  const own = targetId === caller._id;
  const admin = !profileOnly && caller.manager >= 99;
  if (!own && !admin) return { ok: false, errMsg: 'not allowed' };
  const fields = profileOnly ? ['userInfo'] : [
    ...(own ? ['userInfo', 'showcase_achievements', 'mapAccess'] : []),
    ...(admin ? ['manager', 'role', 'mapAccess'] : []),
  ];
  const data = pick(input, fields);
  if ('mapAccess' in data && !admin) {
    const [photos, comments] = await Promise.all([
      db.collection('photo').count({ _openid: openid }),
      db.collection('comment').count({ user_openid: openid }),
    ]);
    const autoPass = photos.result + comments.result >= 60;
    data.mapAccess = { status: autoPass ? 'approved' : 'pending', autoPass,
      applyReason: String(input.mapAccess?.applyReason || ''), applyDate: new Date() };
  }
  if (admin && own && 'manager' in data) return { ok: false, errMsg: 'cannot change your own manager level' };
  if (!Object.keys(data).length) return { ok: false, errMsg: 'no editable fields' };
  return db.collection('user').updateOne({ _id: targetId }, { $set: { ...data, mdate: new Date() } });
}

module.exports.updateUser = updateUser;
