// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database();
const _ = db.command;

// 云函数入口函数
// 判断对于某个组织org来说，当前用户是org管理员，还是猫谱管理员，或者都不是
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || event.openid;
  const org_id = event.org_id;

  const org = (await db.collection('organization').doc(org_id).get()).data;
  if (!org) {
    return "";
  }

  const filter = { openid: openid };
  const user = (await db.collection('user').where(filter).field({manager: true}).get()).data[0];

  if (user && user.manager >= 99) {
    return "mp-manager";
  }

  if (org._openid == openid) {
    return "org-manager";
  }

}