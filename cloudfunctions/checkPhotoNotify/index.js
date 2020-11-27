// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database();
  const _ = db.command;
  var numChkPhotos;
  const triggerNum = 10; //累计一定数量未处理才进行消息提醒
  const tmpId = 'jxcvND-iLSQZLZhlHD2A91ZfBLp0Kexv569MzTxa3zk'; //TODO:与订阅函数同步
  
  db.collection('photo').where({
    verified: false
  }).count().then(res => {
    numChkPhotos = res.total
  })

  if (numChkPhotos >= triggerNum) {
  // TODO:获取已订阅的管理员openid，取一部分（条件待定）遍历发送
    try {
      const result = await cloud.openapi.subscribeMessage.send({
        touser: cloud.getWXContext().OPENID, // 通过 getWXContext 获取 OPENID
        page: 'manager/checkPhotos',
        data: {
          keyword1: {
            value: '339208499'
          },
          keyword2: {
            value: '2015年01月05日 12:30'
          }
        },
        templateId: tmpId,
      })
      // result 结构
      // { errCode: 0, errMsg: 'openapi.subscribeMessage.send:ok' }
      return result
    } catch (err) {
      // 错误处理
      // err.errCode !== 0
      throw err
    }
  }



  return {
    event,
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}