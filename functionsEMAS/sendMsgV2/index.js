module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  try {
    // 获取access_token
    const { result: access_token } = await ctx.mpserverless.function.invoke('getAccessToken');
    
    // 安全打印token（仅显示部分）
    const maskedToken = access_token 
      ? `${access_token.substring(0, 4)}...${access_token.slice(-4)}` 
      : 'null';
    console.log(`Access Token: ${maskedToken}`);
    
    // 构造请求参数
    const param = {
      touser: ctx.args.touser,
      data: ctx.args.data,
      template_id: ctx.args.templateId,
      page: ctx.args.page,
      access_token: access_token
    };
    
    // 发送订阅消息请求
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
    
    // 返回token和API响应结果
    return {
      debug: {
        token: maskedToken, // 返回部分token用于调试
        fullToken: access_token // 返回完整token（仅限开发环境）
      },
      apiResponse: {
        errCode: result.data.errcode,
        errMsg: result.data.errmsg
      }
    };

  } catch (err) {
    // 错误时也返回token
    const maskedToken = access_token 
      ? `${access_token.substring(0, 4)}...${access_token.slice(-4)}` 
      : 'null';
    
    return {
      error: err.message || JSON.stringify(err),
      debug: {
        token: maskedToken,
        fullToken: access_token
      }
    };
  }
}