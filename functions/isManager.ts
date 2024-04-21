import cloud from '@lafjs/cloud'

export async function isManager(openid: string, req: number) {
  if (openid === undefined) {
    return false;
  }

  const db = cloud.database();
  const filter = { openid: openid };
  const user = (await db.collection('user').where(filter).field({ manager: 1 }).get()).data[0];

  if (!user) {
    return false;
  }

  return user.manager && (user.manager >= req);
}

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  // 用户的OpenID
  const openid = ctx.user?.openid;

  // 需要的管理员权限等级
  const req = body.req || 0;

  return await isManager(openid, req);

}
