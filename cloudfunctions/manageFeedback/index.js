// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 1 } }));
  if (!isManager.result) {
    return { msg: 'not a manager', result: isManager };
  }

  const feedback = event.feedback;

  if (event.operation == 'deal') {
    await db.collection('feedback').doc(feedback._id).update({
      data: {
        dealed: true,
        dealDate: new Date()
      }
    });
  } else if (event.operation == 'reply') {
    await db.collection('feedback').doc(feedback._id).update({
      data: {
        replyDate: new Date(),
        replyInfo: event.replyInfo,
      }
    });
  }
}