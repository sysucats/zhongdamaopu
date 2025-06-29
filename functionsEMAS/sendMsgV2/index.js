module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const {
    result: access_token
  } = await ctx.mpserverless.function.invoke('getAccessToken')
  const param = {
    touser: ctx.args.touser,
    data: ctx.args.data,
    template_id: ctx.args.templateId,
    page: ctx.args.page,
    access_token: access_token
  };
  try {
    // POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=ACCESS_TOKEN
    const result = await ctx.httpclient.request('https://api.weixin.qq.com/cgi-bin/message/subscribe/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: param,
      dataType: 'json'
    });
    return {
      errCode: result.data.errcode,
      errMag: result.data.errmsg
    };

  } catch (err) {
    return err;
  }
}