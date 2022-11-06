

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

  const is_manager = await check_manager(2, openid);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  var to_upload = body.to_upload;
  to_upload.openid = openid;

  return db.collection('setting').doc('filter').update( to_upload );
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
