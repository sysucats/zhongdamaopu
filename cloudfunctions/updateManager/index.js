// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init();
const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 99 } }));
  if (!isManager.result) {
    return { ok: false, msg: 'not a manager', result: isManager };
  }

  const _id = event._id;
  const level = event.level;

  if (level > 99) {
    return {ok: false, msg: 'level > 99'}
  }

  const result = await db.collection('user').doc(_id).update({
    data: {
      manager: level
    },
  });
  const updated = result.stats.updated;

  return { ok: (updated === 1), msg: 'updated: '+updated, result: result };
}