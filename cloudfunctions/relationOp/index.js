// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;

// 权限检查
async function check_manager(level) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({
    name: 'isManager',
    data: {
      openid: openid,
      req: level
    }
  }));
  return isManager;
}

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const type = event.type;

  if (type == "saveRelationTypes") {
    // 新建关系类型
    if (!event.relationTypes) {
      return false;
    }
    return await db.collection("setting").doc("relation").update({
      data: {
        types: event.relationTypes
      }
    });
  }
  if (type == "saveRelation") {
    var cat_id = event.cat_id;
    var relations = event.relations;
    return await db.collection("cat").doc(cat_id).update({
      data: {
        relations: relations
      }
    });
  }

  return `unk type ${type}`;
}