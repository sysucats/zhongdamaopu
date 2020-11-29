// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();
const db = cloud.database();
const _ = db.command;
const verifyTplId = 'AtntuAUGnzoBumjfmGB8Yyc-67FUxRH5Cw7bnEYFCXo'; //审核结果通知模板Id
const feedbackTplId = 'IeKS7nPSsBy62REOKiDC2zuz_M7RbKwR97ZiIy_ocmw'; // 反馈回复结果模板Id
const notifyVerifyTplId = 'jxcvND-iLSQZLZhlHD2A91gY0tLSfzyYc3bl39bxVuk' // 提醒审核模版Id
// jxcvND-iLSQZLZhlHD2A91ZfBLp0Kexv569MzTxa3zk

async function arrayResort(oriArray) {
  var resortedArray = [];
  var len = oriArray.length;
  for (var i = 0; i < len; i++) {
    var index = Math.floor(Math.random() * oriArray.length);
    resortedArray.push(oriArray[index]);
    oriArray.splice(index, 1);
  }
  resortedArray = [...resortedArray, ...oriArray];
  return resortedArray;
}

function formatDate(date, fmt) {
  var o = {
    "M+": date.getMonth() + 1, //月份 
    "d+": date.getDate(), //日 
    "h+": date.getHours(), //小时 
    "m+": date.getMinutes(), //分 
    "s+": date.getSeconds(), //秒 
    "q+": Math.floor((date.getMonth() + 3) / 3), //季度 
    "S": date.getMilliseconds() //毫秒 
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
  for (var k in o)
    if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
  return fmt;
}

// 云函数入口函数
exports.main = async (event, context) => {
  const openid = event.openid;
  const tplId = event.tplId;
  const subMsgSettings = await db.collection('setting').doc('subscribeMsg').get()

  if (tplId == verifyTplId) {
    const content = '本次共收录' + event.content.accepted + '张照片' + (event.content.deleted ? ('，有' + event.content.deleted + '张未被收录。') : '。');
    try {
      const result = await cloud.openapi.subscribeMessage.send({
        touser: openid,
        data: {
          thing2: {
            value: '你上传的猫片审核完成！'
          },
          thing7: {
            value: content
          },
          thing5: {
            //注意20个字
            value: event.content.deleted ? '未被收录可能因为重复、模糊或与猫猫无关。' : '感谢你的支持！'
          }
        },
        templateId: verifyTplId,
      })
      return result;
    } catch (err) {
      return err;
    }

  } else if (tplId == feedbackTplId) {
    const doc = await db.collection('feedback').doc(event.fb_id).get();
    const feedback = doc.data;
    const content = feedback.feedbackInfo.length > 20 ? (feedback.feedbackInfo.substr(0, 18) + '..') : feedback.feedbackInfo;
    const reply = event.reply.length > 20 ? event.reply.substr(0, 20) : event.reply;
    try {
      const result = await cloud.openapi.subscribeMessage.send({
        touser: openid,
        data: {
          thing5: {
            value: content
          },
          date4: {
            value: formatDate(feedback.openDate, "yyyy年MM月dd日 hh:mm:ss")
          },
          thing3: {
            //注意20个字
            value: reply
          }
        },
        templateId: feedbackTplId,
      })
      return result;
    } catch (err) {
      return err;
    }
  } else if (tplId == notifyVerifyTplId) {
    const maxReceiverNum = subMsgSettings.data.verifyPhoto.receiverNum;// 最多推送给几位管理员
    // console.log('maxReceiverNum',maxReceiverNum);
    const numUnchkPhotos = event.numUnchkPhotos;
    const receiverCounter = 0; 
    const verifyPhotoLevel = 2; // 所需最小管理员等级
    const wxContext = cloud.getWXContext()
    const _ = db.command;
    // const content = '又有' + numUnchkPhotos + '张新的猫片啦，有空审核一下吧';
    const content = '又有几张新的照片啦，有空看看猫猫吧'

    var managerList = await db.collection('user').where({
      manager: _.gte(verifyPhotoLevel) 
    }).get();
    // console.log("testList:", testList);
    var resortedML = await arrayResort(managerList.data);
    // console.log('resortML:', resortedML);

    var uploadTimeList = await db.collection('photo').where({
      verified: false
    }).orderBy('mdate', 'asc').get(); //最早一条未审核照片的提交时间
    // console.log("earliestUnverifyTime:", uploadTimeList);
    var earliestTime = formatDate(uploadTimeList.data[0].mdate, 'MM月dd日 hh:mm:ss')
    var result;
    for (var manager of resortedML) {
      try {
          result = await cloud.openapi.subscribeMessage.send({
          touser: manager['openid'],
          page: 'pages/manage/checkPhotos/checkPhotos',
          data: {
            number5: {
              value: numUnchkPhotos
            },
            thing2: {
              value: content
            },
            time6: {
              value: earliestTime
            }
          },
          templateId: notifyVerifyTplId,
        })
        // result 结构
        // { errCode: 0, errMsg: 'openapi.templateMessage.send:ok' }
        // console.log("sendResult:", result);
        if(result.errCode === 0){
          receiverCounter += 1;
          if (receiverCounter >= maxReceiverNum) {
            break;
          }
        }
      } catch (err) {
        //遇到未订阅的管理员，TODO:建立订阅状态登记系统
        // if (err.errCode === 43101) {
        //   console.log("4310143101:", err);
        // }else{
        //   console.log("errerr:", err);
        // }
        continue;
      }
    }
    return 'send to'+ receiverCounter + 'manager' ;
  }
}