const { createInternalCtx } = require('./_helper.js')
const getAccessTokenHandler = require('./getAccessToken.js')

module.exports = async (ctx) => {
  const access_token = await getAccessTokenHandler(createInternalCtx(ctx, {}))

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
