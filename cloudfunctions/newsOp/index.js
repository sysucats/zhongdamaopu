// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
const _ = db.command;

// 权限检查
async function check_manager(level) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: level } }));
  return isManager;
}

async function modify(item_id, data) {
  return await db.collection("news").doc(item_id).update({
    data: data
  });
}

// 云函数入口函数
exports.main = async (event, context) => {
  const type = event.type;

  if (type == "modify") {
    if (!check_manager(3)) {
      throw `not a manager.`;
    }
    const item_id = event.item_id;
    const item_data = event.item_data;
    return modify(item_id, item_data);
  }

  throw `unk type ${type}`;
}