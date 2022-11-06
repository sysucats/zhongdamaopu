// commentOp 留言的创建和删除操作

import cloud from '@/cloud-sdk'
import axios from 'axios';

const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx;

  const type = body.type;
  const openid = auth.openid;

  if (type == "deleteComment") { // 删除留言
    const is_manager = await check_manager(1, openid);
    if (!is_manager) {
      return { msg: 'not a manager', result: false };
    }
    const comment_id = body.comment_id;
    return await db.collection("comment").doc(comment_id).update({
      deleted: true,
    });
  }
  else if (type == "addComment") { // 添加留言
    const data = body.data;
    return await db.collection("comment").add(data);
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
