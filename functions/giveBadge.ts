import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const db = cloud.database();
  const { openid } = ctx.user;
  const { catId, badgeDef } = ctx.body;
  const badge = (await db.collection('badge').where({ badgeDef: badgeDef, _openid: openid, catId: null }).limit(1).get()).data;

  if (!badge) {
    return {ok: false };
  }

  // 送出去
  await db.collection('badge').doc(badge[0]._id).update({ catId: catId, givenTime: new Date() });
  return { ok: true };
}