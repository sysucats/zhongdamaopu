// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();

// 云函数入口函数
exports.main = async (event, context) => {
  const openid = event.openid;
  const formId = event.formId;
  var content = '本次共收录' + event.content.accepted + '张照片' + (event.content.deleted? ('，有' + event.content.deleted + '张未被收录。'): '。');
  try {
    const result = await cloud.openapi.templateMessage.send({
      touser: openid, // 通过 getWXContext 获取 OPENID
      page: 'pages/genealogy/genealogy',
      data: {
        // 
        keyword1: {
          value: '你上传的猫片审核完成！'
        },
        keyword2: {
          value: content
        },
        keyword3: {
          value: (event.content.deleted ? '未被收录可能是因为重复、模糊、或与猫猫无关。\n': '') + '感谢你的支持！'
        }
      },
      templateId: 'Sv3vW9rFffD_mRM4W8ivV_WSaL1vrfoey9QS8VlRNOo',
      formId: formId,
      // emphasisKeyword: 'keyword1.DATA'
    })
    // result 结构
    // { errCode: 0, errMsg: 'openapi.templateMessage.send:ok' }
    return result
  } catch (err) {
    // 错误处理
    // err.errCode !== 0
    throw err
  }
}