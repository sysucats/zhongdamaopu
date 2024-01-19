import cloud from '@lafjs/cloud'

import { login } from '@/login'

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  // 数据库操作
  const db = cloud.database()
    if (body.deploy_test === true) {
    // 进行部署检查
    return;
    }
  // console.log(ctx);

  var openid = ctx.user?.openid;
  if (openid == undefined) {
    console.log("undefined user, code", body.wx_code);
    openid = (await login(body.wx_code)).openid;
  }

  if (!openid) {
    return {};
  }
  
  // 获取当前操作是干啥子的
  const op = body.op;
  switch(op) {
    case 'get': {
      // 获取用户，如果没有就新建一个
      const user = (await db.collection('user').where({ 'openid': openid }).get()).data[0];
      if (user) {
        return user;
      }
      const count = (await db.collection('user').count()).total;
      let newUser = { 'openid': openid };
      if (count === 0) {
        newUser['manager'] = 99;
      }
      await db.collection('user').add(newUser);
      return (await db.collection('user').where({ 'openid': openid }).get()).data[0];
    }
    case 'update': {
      const targetUser = (await db.collection('user').where({ 'openid': openid }).get()).data[0];
      if (targetUser.openid != openid) {
        return "Err, can only update your own info.";
      }
      var user = body.user;
      const _id = user._id;
      delete user._id; // 因为数据库不能更新_id
      delete user.openid; // 这个键唯一
      delete user.manager; // 不能用这个函数更新
      await db.collection('user').doc(_id).update( user );
      return (await db.collection('user').where({ 'openid': openid }).get()).data[0];
    }
    case 'updateRole': {
      var user = body.user;
      await db.collection('user').where({ 'openid': openid }).update( user );
    }
    default: {
      return "unknown op: " + op;
    }
  }
}

