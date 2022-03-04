const cloud = require('wx-server-sdk')
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})

exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
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