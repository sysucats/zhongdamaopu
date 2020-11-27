// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();
const db = cloud.database();
const _ = db.command;
const verifyTplId = 'AtntuAUGnzoBumjfmGB8Yyc-67FUxRH5Cw7bnEYFCXo'; //审核结果通知模板Id
const feedbackTplId = 'IeKS7nPSsBy62REOKiDC2zuz_M7RbKwR97ZiIy_ocmw'; // 反馈回复结果模板Id
const notifyVerifyTplId = 'jxcvND-iLSQZLZhlHD2A91gY0tLSfzyYc3bl39bxVuk' // 提醒审核模版Id
// jxcvND-iLSQZLZhlHD2A91ZfBLp0Kexv569MzTxa3zk

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
  const numUnchkPhotos = event.numUnchkPhotos;
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
    const wxContext = cloud.getWXContext()
    const _ = db.command;
    const content = '又有' + numUnchkPhotos + '张新的猫片啦，有空审核一下吧';
    var managerList;
    // 管理员openIdList
    var res = await db.collection('user').where({
      manager: _.gt(10).lt(12)
    }).get();
    managerList = res.data; // TODO:随机推送/按序轮流推送部分管理员

    //最早一条未审核照片的提交时间
    var uploadTimeList = await db.collection('photo').where({
      verified : false
    }).orderBy('mdate','asc').get();
    console.log("earliestUnverifyTime:", uploadTimeList);
    var earliestTime = formatDate(uploadTimeList.data[0].mdate,'MM月dd日 hh:mm:ss')

    for (var manager of managerList) {
        try {
          var result = await cloud.openapi.subscribeMessage.send({
            touser: manager['openid'],
            page: 'pages/manage/checkPhotos/checkPhotos',
            data: {
              number5: {
                value: numUnchkPhotos
              },
              thing2:{
              // thing7: {
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
          console.log("sendResult:", result);
          return result;
        } catch (err) {
          // 错误处理
          // err.errCode !== 0
          // throw err
          console.log("errerr:", err);
          return err;
        }
      }
    console.log("mgList1:", managerList);
  }
}