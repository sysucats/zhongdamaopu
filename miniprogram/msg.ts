// const { fail } = require("assert");

const verifyTplId = 'AtntuAUGnzoBumjfmGB8Yyc-67FUxRH5Cw7bnEYFCXo'; //审核结果通知模板Id
const feedbackTplId = 'IeKS7nPSsBy62REOKiDC2zuz_M7RbKwR97ZiIy_ocmw'; // 反馈回复结果模板Id
export const notifyVerifyTplId = 'jxcvND-iLSQZLZhlHD2A91gY0tLSfzyYc3bl39bxVuk'; // 提醒审核模版Id
export const notifyChkFeedbackTplId = 'jxcvND-iLSQZLZhlHD2A97jP3fm_FWV4wL_GFUcLxcQ';

export async function requestNotice(template) {
  var tplId;
  if (template == 'verify') {
    tplId = verifyTplId;
  } else if (template == 'notifyVerify') {
    tplId = notifyVerifyTplId;
  } else if (template == 'notifyChkFeedback') {
    tplId = notifyChkFeedbackTplId;
  } else {
    tplId = feedbackTplId;
  }

  try {
    let res = await wx.requestSubscribeMessage({
      tmplIds: [tplId],
    });
    console.log("requestSubMsgRes:", res);

    if (res.errMsg != 'requestSubscribeMessage:ok') { //这个条件会触发吗？
      console.log('调用消息订阅请求接口失败' + res.errCode);
      await wx.showToast({
        title: '消息订阅好像出了点问题',
        icon: 'none',
        duration: 500,
      })
      return false;
    }

    if (res[tplId] == 'accept') {
      await wx.showToast({
        title: '结果能通知你啦',
        icon: 'success',
        duration: 800,
      })
      return true;
    } else {
      await wx.showToast({
        title: '你拒收了通知QAQ',
        icon: 'none',
        duration: 800,
      })
      return false;
    }

  } catch (error) { // 订阅消息错误处理
    console.log("request SubMsg error:", error)
    await wx.showModal({
      title: '提示',
      content: '订阅消息出错（错误代码：' + error.errCode + '）\n请尝试通过 “关于页”-“信息反馈”内的邮箱 或 “笃行志愿服务队”公众号留言联系我们，感谢反馈！',
      showCancel: false,
    });
    return false;
  }
}

// 发送审核消息
export function sendVerifyNotice(notice_list) {
  const openids = Object.keys(notice_list);
  if (!openids.length) {
    return false;
  }
  const db = wx.cloud.database();
  const _ = db.command;
  // 获取需要发送的list
  for (const openid of openids) {
    wx.cloud.callFunction({
      name: 'sendMsg',
      data: {
        openid: openid,
        tplId: verifyTplId,
        content: notice_list[openid]
      }
    });
  }
}

// 发送回复消息
export async function sendReplyNotice(openid, fb_id) {
  const db = wx.cloud.database();
  const _ = db.command;
  let res = await wx.cloud.callFunction({
    name: 'sendMsg',
    data: {
      openid: openid,
      tplId: feedbackTplId,
      fb_id: fb_id
    }
  });
  return res.result;
}

// 发送提醒审核消息
export function sendNotifyVertifyNotice(numUnchkPhotos) {
  const db = wx.cloud.database();
  const _ = db.command;
  let res = wx.cloud.callFunction({
    name: 'sendMsg',
    data: {
      numUnchkPhotos: numUnchkPhotos,
      tplId: notifyVerifyTplId,
    },
    success: res => {
      console.log("callSendMsgSuccess:", res);
    },
    fail: res => {
      console.log("callSendMsgFail:", res);
    }
  });
  return res;
}