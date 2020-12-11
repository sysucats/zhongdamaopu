// 云函数入口文件
const cloud = require('wx-server-sdk')
const notifyChkFeedbackTplId = 'jxcvND-iLSQZLZhlHD2A97jP3fm_FWV4wL_GFUcLxcQ';

cloud.init()
const db = cloud.database();

// function sendNotifyChkFeedbackMsg(){
// }

// 云函数入口函数
exports.main = async (event, context) => {
  cloud.callFunction({
    name:'sendMsg',
    data:{
      tplId: notifyChkFeedbackTplId,
    },
    success:res=>{
      console.log("sendNotifyChkFB:",res);
    }
  })

  // 在sendMsg内判断
  
  // const wxContext = cloud.getWXContext()
  // var undealedFeedbackNum = await db.collection('feedback').where({
  //   dealed: false
  // }).count()
  // console.log('undealNum:',undealedFeedbackNum);
  // if (undealedFeedbackNum.total > 0) {
  //   cloud.callFunction({
  //     name:'sendMsg',
  //     data:{
  //       tplId: notifyChkFeedbackTplId,
  //       undealedFeedbackNum: undealedFeedbackNum.total
  //     },
  //     success:res=>{
  //       console.log("sendNotifyChkFB:",res);
  //     }
  //   })
  // }
  return {
    event,
    // openid: wxContext.OPENID,
    // appid: wxContext.APPID,
    // unionid: wxContext.UNIONID,
  }
}