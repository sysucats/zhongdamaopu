import { formatDate, arrayResort } from "./utils";
import { getGlobalSettings } from "./page";
import api from "./cloudApi";
const app = getApp();
async function _getMsgConfig() {
  let subscribe = await getGlobalSettings("subscribe");
  let res = {};
  for (const key in subscribe) {
    const value = subscribe[key];
    let [name, field] = key.split("#");
    if (res[name] === undefined) {
      res[name] = {};
    }
    res[name][field] = value;
  }
  return res;
}

let msgConfig = null;
_getMsgConfig().then(x => { msgConfig = x });

function getMsgTplId(template) {
  console.log(template, msgConfig)
  return msgConfig[template].ID;
}

// 订阅请求
async function requestNotice(template) {
  const cfg = msgConfig[template];
  console.log(template, cfg);

  try {
    let res = await wx.requestSubscribeMessage({
      tmplIds: [cfg.ID],
    });
    console.log("requestSubMsgRes:", res);

    if (!res || res.errMsg != 'requestSubscribeMessage:ok') {
      console.log('调用消息订阅请求接口失败' + res.errCode);
      await wx.showToast({
        title: '消息订阅好像出了点问题',
        icon: 'none',
        duration: 500,
      })
      return false;
    }

    if (res[cfg.ID] == 'accept') {
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
      [cfg.title]: {
        value: '你上传的猫片审核完成！'
      },
      [cfg.content]: {
        value: content
      },
      [cfg.note]: {
        value: note
      },
    }

    api.sendMsgV2({
      touser: openid,
      data: data,
      templateId: cfg.ID,
      page: 'pages/genealogy/genealogy',
    });
  }
}

// 发送回复消息
async function sendReplyNotice(openid, fb_id) {
  const cfg = msgConfig.feedback;
  const { result: feedback } = await app.mpServerless.db.collection('feedback').findOne({ _id: fb_id });
  const content = feedback.feedbackInfo.length > 20 ? (feedback.feedbackInfo.substr(0, 18) + '..') : feedback.feedbackInfo;

  const data = {
    [cfg.title]: {
      value: '你的反馈已被回复，点击进入小程序查看'
    },
    [cfg.content]: {
      value: content
    },
    [cfg.time]: {
      value: formatDate(feedback.openDate, "yyyy年MM月dd日 hh:mm:ss")
    },
  }

  let res = await api.sendMsgV2({
    touser: openid,
    data: data,
    templateId: cfg.ID,
    page: 'pages/info/feedback/myFeedback/myFeedback',
  });

  return res;
}

// 发送提醒审核照片消息
async function sendNotifyVertifyNotice(numUnchkPhotos) {

  const { result: subMsgSettings } = await app.mpServerless.db.collection('setting').findOne({ _id: 'subscribeMsg' });

  const maxReceiverNum = subMsgSettings.verifyPhoto.receiverNum; // 最多推送给几位管理员
  var receiverCounter = 0;
  const verifyPhotoLevel = 2; // 所需最小管理员等级

  const { result: managerList } = await app.mpServerless.db.collection('user').find({
    manager: { $gte: verifyPhotoLevel }
  });
  var resortedML = await arrayResort(managerList);
  // console.log('resortML:', resortedML);

  //最早一条未审核照片的提交时间
  const { result: uploadTimeList } = await app.mpServerless.db.collection('photo').find({ verified: false }, { sort: { mdate: 1 } });
  // console.log("earliestUnverifyTime:", uploadTimeList);
  var earliestTime = formatDate(uploadTimeList[0].mdate, 'MM月dd日 hh:mm:ss');
  const cfg = msgConfig.notifyVerify;
  for (var manager of resortedML) {
    var data = {
      [cfg.title]: {
        value: '又有几张新的照片啦，有空看看猫猫吧'
      },
      [cfg.number]: {
        value: numUnchkPhotos
      },
      [cfg.time]: {
        value: earliestTime
      },
    }

    var res = await api.sendMsgV2({
      touser: manager['openid'],
      data: data,
      templateId: cfg.ID,
      page: 'pages/manage/checkPhotos/checkPhotos',
    });

    if (res.errCode === 0) {
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
  const { result: subMsgSettings } = await app.mpServerless.db.collection('setting').findOne({ _id: 'subscribeMsg' });
  const maxReceiverNum = subMsgSettings.chkFeedback.receiverNum; // 最多推送给几位管理员
  var receiverCounter = 0;
  const { result: managerList } = await app.mpServerless.db.collection('user').find({
    manager: { $gte: dealFeedbackLevel }
  });
  var resortedML = await arrayResort(managerList);

  // 最早一条未回复反馈的提交时间
  const { result: uploadTimeList } = await app.mpServerless.db.collection('feedback').find({
    dealed: false,
    replyInfo: { $exists: false }
  }, { sort: { openDate: 1 } });
  console.log("unreplyFeedback:", uploadTimeList);

  if (uploadTimeList.length === 0) {
    return false;
  }

  var earliestTime = formatDate(uploadTimeList[0].openDate, 'MM月dd日 hh:mm')
  const cfg = msgConfig.notifyChkFeedback;

  for (var manager of resortedML) {
    var data = {
      [cfg.title]: {
        value: '还有同学的反馈没被处理哦'
      },
      [cfg.number]: {
        value: uploadTimeList.length
      },
      [cfg.time]: {
        value: earliestTime
      },
    }

    var res = await api.sendMsgV2({
      touser: manager['openid'],
      data: data,
      templateId: cfg.ID,
      page: 'pages/manage/checkFeedbacks/checkFeedbacks',
    });

    if (res.errCode === 0) {
      receiverCounter += 1;
      if (receiverCounter >= maxReceiverNum) {
        break;
      }
    }
  }
}


// 发送审核便利贴留言消息
function sendVerifyCommentNotice(notice_list) {
  const cfg = msgConfig.verify;  // 和照片审核通用
  const openids = Object.keys(notice_list);
  if (!openids.length) {
    return false;
  }
  // 获取需要发送的list
  for (const openid of openids) {
    const content = '本次共收录' + notice_list[openid].accepted + '张便利贴' + (notice_list[openid].deleted ? ('，有' + notice_list[openid].deleted + '张未被收录。') : '。');
    const note = notice_list[openid].deleted ? '未被收录可能因为与猫猫无关。' : '感谢你的支持！';

    const data = {
      [cfg.title]: {
        value: '你的便利贴审核完成！'
      },
      [cfg.content]: {
        value: content
      },
      [cfg.note]: {
        value: note
      },
    }

    api.sendMsgV2({
      touser: openid,
      data: data,
      templateId: cfg.ID,
      page: 'pages/genealogy/genealogy',
    });
  }
}



// 发送提醒审核便利贴留言消息
async function sendNotifyVertifyCommentNotice(numUnchkComment) {
  const { result: subMsgSettings } = await app.mpServerless.db.collection('setting').find({ _id:'subscribeMsg' });

  // 借用一下照片的设置
  const maxReceiverNum = subMsgSettings.data.verifyPhoto.receiverNum; // 最多推送给几位管理员
  var receiverCounter = 0;
  const verifyPhotoLevel = 2; // 所需最小管理员等级

  const { result: managerList } = await app.mpServerless.db.collection('user').find({
    manager: { $gte: verifyPhotoLevel }
  });
  var resortedML = await arrayResort(managerList);
  // console.log('resortML:', resortedML);

 
  //最早一条未审核照片的提交时间
  const { result: uploadTimeList } = await app.mpServerless.db.collection('comment').find({ verified: false }, { sort: { create_date: 1 } });
  // console.log("earliestUnverifyTime:", uploadTimeList);
  var earliestTime = formatDate(uploadTimeList.data[0].create_date, 'MM月dd日 hh:mm:ss');
  const cfg = msgConfig.notifyVerify;
  for (var manager of resortedML) {
    var data = {
      [cfg.title]: {
        value: '又有几张新便利贴啦，有空看看吧'
      },
      [cfg.number]: {
        value: numUnchkComment
      },
      [cfg.time]: {
        value: earliestTime
      },
    }

    var res = await api.sendMsgV2({
      touser: manager['openid'],
      data: data,
      templateId: cfg.ID,
      page: 'pages/manage/checkPhotos/checkPhotos',
    });

    if (res.errCode === 0) {
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
  getMsgTplId,
  sendVerifyCommentNotice,
  sendNotifyVertifyCommentNotice,
}