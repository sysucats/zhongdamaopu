// isManager 判断管理员等级

import cloud from '@/cloud-sdk';

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  // 用户的OpenID
  const openid = auth.openid;

  // 需要的管理员权限等级
  const req = body.req || 0;

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }

  const filter = { openid: openid };
  const db = cloud.database();
  const user = (await db.collection('user').where(filter).field({manager: true}).get()).data[0];

  if (!user) {
    return false;
  }

  return user.manager && (user.manager >= req);
}
