// feedbackOp 反馈的提交、更新、回复和处理操作

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

  if (body.operation == 'submit') {
    console.log("Call feedbackOp(submit)");
    const db = cloud.database();
    var data = body.data;
    // Laf云不会主动存储_openid，但是微信云会
    // 如果前端需要跟据_openid字段进行数据库搜索，需要手动保存
    data._openid = openid; 
    return await db.collection('feedback').add(data);
  }
  else if (body.operation == 'update') {
    console.log("Call feedbackOp(update)");
    const db = cloud.database();
    const repliable = body.repliable;
    const feedbackId = body.feedbackId;
    return await db.collection('feedback').doc(feedbackId).update({
      repliable: repliable
    })
  }
  else if (body.operation == 'deal') {
    const is_manager = await check_manager(1, openid);
    if (!is_manager) {
      return { msg: 'not a manager', result: false };
    }
    console.log("Call feedbackOp(deal)");
    const feedback = body.feedback;
    return await db.collection('feedback').doc(feedback._id).update({
      dealed: true,
      dealDate: new Date()
    });
  }
  else if (body.operation == 'reply') {
    const is_manager = await check_manager(1, openid);
    if (!is_manager) {
      return { msg: 'not a manager', result: false };
    }
    console.log("Call feedbackOp(reply)");
    const feedback = body.feedback;
    return await db.collection('feedback').doc(feedback._id).update({
      replyDate: new Date(),
      replyInfo: body.replyInfo,
    });
  }
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


