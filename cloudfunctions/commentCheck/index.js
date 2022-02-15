const cloud = require('wx-server-sdk')
cloud.init()

exports.main = async (event, context) => {
  console.log(event, context);
  const wxContext = cloud.getWXContext()
  try {
    const result = await cloud.openapi.security.msgSecCheck({
        "openid": wxContext.OPENID,
        "scene": 2,
        "version": 2,
        "content": event.content,
        "nickname": event.nickname,
      })
    return result
  } catch (err) {
    return err
  }
}