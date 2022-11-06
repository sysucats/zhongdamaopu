

import cloud from '@/cloud-sdk';
import axios from 'axios';
const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const openid = auth.openid;
  const is_manager = await check_manager(99, openid);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  const _id = body._id;
  const level = body.level;

  if (level > 99) {
    return {ok: false, msg: 'level > 99'}
  }

  const result = await db.collection('user').doc(_id).update({ manager: level });
  const updated = result.updated;
  
  return { ok: (updated === 1), msg: 'updated: '+ updated, result: result };
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


