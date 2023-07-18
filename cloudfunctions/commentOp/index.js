// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();
const _ = db.command;

// 删除便利贴
async function delete_comment(comment_id) {
  db.collection("comment").doc(comment_id).update({
    data: {
      deleted: true,
    }
  });
}

// 权限检查
async function check_manager() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 1 } }));
  return isManager;
}

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const type = event.type;

  if (type == "delete_comment") {
    if (!check_manager()) {
      return `not a manager.`
    }
    const comment_id = event.comment_id;
    return delete_comment(comment_id);
  }

  return `unk type ${type}`
}