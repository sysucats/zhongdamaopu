module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const {
    result: access_token
  } = await ctx.mpserverless.function.invoke('getAccessToken')

  try {
    const result = await ctx.httpclient.request(`https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        openid: ctx.args.openid,
        scene: 2,
        version: 2,
        content: ctx.args.content,
        nickname: ctx.args.nickname
      },
      dataType: 'json'
    });
    return result.data;
  } catch (err) {
    console.log("Error:", err);
    return err;
  }
}