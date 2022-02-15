const formatDate = require("./utils").formatDate;
const arrayResort = require("./utils").arrayResort;
const msgConfig = require("./config").msg;

// 订阅请求
async function requestNotice(template) {
  const cfg = msgConfig[template];

  try {
    let res = await wx.requestSubscribeMessage({
      tmplIds: [cfg.id],
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

    if (res[cfg.id] == 'accept') {
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
function sendVerifyNotice(notice_list) {
  const cfg = msgConfig.verify;
  const openids = Object.keys(notice_list);
  if (!openids.length) {
    return false;
  }
  // 获取需要发送的list
  for (const openid of openids) {
    const content = '本次共收录' + notice_list[openid].accepted + '张照片' + (notice_list[openid].deleted ? ('，有' + notice_list[openid].deleted + '张未被收录。') : '。');
    const note = notice_list[openid].deleted ? '未被收录可能因为重复、模糊或与猫猫无关。' : '感谢你的支持！';

    const data = {
      [cfg.map.title]: {
        value: '你上传的猫片审核完成！'
      },
      [cfg.map.content]: {
        value: content
      },
      [cfg.map.note]: {
        value: note
      },
    }

    wx.cloud.callFunction({
      name: 'sendMsgV2',
      data: {
        touser: openid,
        data: data,
        templateId: cfg.id,
        page: 'pages/genealogy/genealogy',
      }
    });
  }
}

// 发送回复消息
async function sendReplyNotice(openid, fb_id) {
  const cfg = msgConfig.feedback;
  const db = wx.cloud.database();
  const doc = await db.collection('feedback').doc(fb_id).get();
  const feedback = doc.data;
  const content = feedback.feedbackInfo.length > 20 ? (feedback.feedbackInfo.substr(0, 18) + '..') : feedback.feedbackInfo;

  const data = {
    [cfg.map.title]: {
      value: '你的反馈已被回复，点击进入小程序查看'
    },
    [cfg.map.content]: {
      value: content
    },
    [cfg.map.time]: {
      value: formatDate(feedback.openDate, "yyyy年MM月dd日 hh:mm:ss")
    },
  }

  let res = await wx.cloud.callFunction({
    name: 'sendMsgV2',
    data: {
      touser: openid,
      data: data,
      templateId: cfg.id,
      page: 'pages/info/feedback/myFeedback/myFeedback',
    }
  });

  return res.result;
}

// 发送提醒审核消息
async function sendNotifyVertifyNotice(numUnchkPhotos) {
  const db = wx.cloud.database();
  const _ = db.command;

  const subMsgSettings = await db.collection('setting').doc('subscribeMsg').get();

  const maxReceiverNum = subMsgSettings.data.verifyPhoto.receiverNum; // 最多推送给几位管理员
  var receiverCounter = 0;
  const verifyPhotoLevel = 2; // 所需最小管理员等级

  var managerList = await db.collection('user').where({
    manager: _.gte(verifyPhotoLevel)
  }).get();
  var resortedML = await arrayResort(managerList.data);
  // console.log('resortML:', resortedML);

  var uploadTimeList = await db.collection('photo').where({
    verified: false
  }).orderBy('mdate', 'asc').get(); //最早一条未审核照片的提交时间
  // console.log("earliestUnverifyTime:", uploadTimeList);
  var earliestTime = formatDate(uploadTimeList.data[0].mdate, 'MM月dd日 hh:mm:ss');
  const cfg = msgConfig.notifyVerify;
  for (var manager of resortedML) {
    var data = {
      [cfg.map.title]: {
        value: '又有几张新的照片啦，有空看看猫猫吧'
      },
      [cfg.map.number]: {
        value: numUnchkPhotos
      },
      [cfg.map.time]: {
        value: earliestTime
      },
    }

    var res = await wx.cloud.callFunction({
      name: 'sendMsgV2',
      data: {
        touser: manager['openid'],
        data: data,
        templateId: cfg.id,
        page: 'pages/manage/checkPhotos/checkPhotos',
      }
    });

    if (res.result.errCode === 0) {
      receiverCounter += 1;
      if (receiverCounter >= maxReceiverNum) {
        break;
      }
    }
  }
}

// 发送提醒处理反馈的订阅消息
async function sendNotifyChkFeeedback() {
  const dealFeedbackLevel = 1;
  
  const db = wx.cloud.database();
  const _ = db.command;

  const subMsgSettings = await db.collection('setting').doc('subscribeMsg').get();
  const maxReceiverNum = subMsgSettings.data.chkFeedback.receiverNum; // 最多推送给几位管理员
  var receiverCounter = 0;
  var managerList = await db.collection('user').where({
    manager: _.gte(dealFeedbackLevel)
  }).get();
  var resortedML = await arrayResort(managerList.data);

  var uploadTimeList = await db.collection('feedback').where({
    dealed: false,
    replyInfo: _.exists(false)
  }).orderBy('openDate', 'asc').get(); //最早一条未回复反馈的提交时间
  console.log("unreplyFeedback:", uploadTimeList);

  if (uploadTimeList.data.length === 0) {
    return false;
  }

  var earliestTime = formatDate(uploadTimeList.data[0].openDate, 'MM月dd日 hh:mm')
  const cfg = msgConfig.notifyChkFeedback;

  for (var manager of resortedML) {
    var data = {
      [cfg.map.title]: {
        value: '还有同学的反馈没被处理哦'
      },
      [cfg.map.number]: {
        value: uploadTimeList.data.length
      },
      [cfg.map.time]: {
        value: earliestTime
      },
    }

    var res = await wx.cloud.callFunction({
      name: 'sendMsgV2',
      data: {
        touser: manager['openid'],
        data: data,
        templateId: cfg.id,
        page: 'pages/manage/checkFeedbacks/checkFeedbacks',
      }
    });

    if (res.result.errCode === 0) {
      receiverCounter += 1;
      if (receiverCounter >= maxReceiverNum) {
        break;
      }
    }
  }
}

module.exports = {
  requestNotice,
  sendVerifyNotice,
  sendReplyNotice,
  sendNotifyVertifyNotice,
  sendNotifyChkFeeedback,
}