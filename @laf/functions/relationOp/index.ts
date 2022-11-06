

import cloud from '@/cloud-sdk';
import axios from 'axios';
const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const type = body.type;

  const openid = auth.openid;
  const is_manager = await check_manager(1, openid);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  if (type == "init") {
    // 当数据库setting中不存在时，进行初始化
    var types = ["爸爸", "妈妈"]
    return await db.collection('setting').doc('relation').set({
      types: types,
    });
  }
  if (type == "saveRelationTypes") {
    // 新建关系类型
    if (!body.relationTypes) {
      return false;
    }
    return await db.collection("setting").doc("relation").update({
      types: body.relationTypes
    });
  }
  if (type == "saveRelation") {
    var cat_id = body.cat_id;
    var relations = body.relations;
    return await db.collection("cat").doc(cat_id).update({
      relations: relations  
    });
  }
  return `unk type ${type}`;
}

// 权限检查
async function check_manager(level, openid) {  
  const isManager = await cloud.invoke('isManager', {
    auth: {
      openid: openid,
    },
    body: {
      req: level
    }
  });
  return isManager;
}

