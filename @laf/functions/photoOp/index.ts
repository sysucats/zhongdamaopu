

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
  const data = body.data;

  if (type == "addPhoto") {
    console.log("Invoke photoOp(addPhoto)");
    const db = cloud.database();
    return await db.collection('photo').add( data );
  }
  
  return `unk type ${type}`;
}

// 权限检查
// async function check_manager(level, openid) {  
//   const isManager = await cloud.invoke('isManager', {
//     auth: {
//       openid: openid,
//     },
//     body: {
//       req: level
//     }
//   });
//   return isManager;
// }

