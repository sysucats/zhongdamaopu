// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 3 } }));
  if (!isManager.result) {
    return { ok: false, msg: 'not a manager', result: isManager };
  }

  const reward = event.reward_to_change;

  if (reward._id) {
    var result = await db.collection('reward').doc(reward._id).update({
      data: {
        records: reward.records
      },
    });
  } else {    // 无_id，新月份
    var result = await db.collection('reward').add({
      data: {
        mdate: new Date(reward.mdate),  // cloud.callFunction会把Date变成string
        records: reward.records
      }
    })
  }

  return result;
}