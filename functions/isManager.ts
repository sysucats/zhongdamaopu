import cloud from '@lafjs/cloud'

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  // 用户的OpenID
  const openid = ctx.user?.openid;

  // 需要的管理员权限等级
  const req = body.req || 0;

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }

  const filter = { openid: openid };
  const db = cloud.database();
  const user = (await db.collection('user').where(filter).field({manager: 1}).get()).data[0];

  if (!user) {
    return false;
  }

  return user.manager && (user.manager >= req);
}
