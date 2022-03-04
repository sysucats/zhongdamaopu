// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database();
const _ = db.command;

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || event.openid;

  const filter = { openid: openid };
  const user = (await db.collection('user').where(filter).field({manager: true}).get()).data[0];

  if (!user) {
    return false;
  }

  // 需要的管理员权限等级为
  const req = event.req || 0;
  
  return user.manager && (user.manager >= req);
}