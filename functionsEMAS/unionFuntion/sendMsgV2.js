module.exports = async (ctx) => {
  try {
    const { result: access_token } = await ctx.mpserverless.function.invoke('getAccessToken');

    const maskedToken = access_token
      ? `${access_token.substring(0, 4)}...${access_token.slice(-4)}`
      : 'null';
    console.log(`Access Token: ${maskedToken}`);

    const param = {
      touser: ctx.args.touser,
      data: ctx.args.data,
      template_id: ctx.args.templateId,
      page: ctx.args.page,
      access_token: access_token
    };

    const result = await ctx.httpclient.request(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(access_token)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: param,
        dataType: 'json'
      }
    );

    return {
      debug: {
        token: maskedToken,
        fullToken: access_token
      },
      apiResponse: {
        errCode: result.data.errcode,
        errMsg: result.data.errmsg
      }
    };

  } catch (err) {
    return {
      error: err.message || JSON.stringify(err),
      debug: {
        token: 'null',
        fullToken: null
      }
    };
  }
}
