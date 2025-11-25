module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  const { result: app_secret } = await ctx.mpserverless.db.collection('app_secret').findOne();
  
  if (!app_secret?.MP_APPID || !app_secret?.MP_SECRET) {
    throw new Error('缺少 AppID 或 AppSecret 配置');
  }

  // 读取数据库中的 token
  const { result: record } = await ctx.mpserverless.db.collection('setting').findOne({
    _id: "accessToken"
  });

  // 检查 token 是否有效（提前5分钟刷新）
  if (record && Math.floor(Date.now() / 1000) < record.expiredAt - 300) {
    console.log("使用缓存 token");
    return record.accessToken;
  }

  try {
    // 使用稳定版接口，POST 请求
    const result = await ctx.httpclient.request('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        appid: app_secret.MP_APPID,
        secret: app_secret.MP_SECRET,
        grant_type: 'client_credential',
        force_refresh: false  // 普通模式
      },
      dataType: 'json',
      timeout: 10000
    });

    if (result.status !== 200) {
      throw new Error(`HTTP错误: ${result.status}`);
    }

    // 检查微信接口返回的错误码
    if (result.data.errcode && result.data.errcode !== 0) {
      throw new Error(`微信接口错误: ${result.data.errcode} - ${result.data.errmsg}`);
    }

    if (!result.data.access_token) {
      throw new Error('获取到的 access_token 为空');
    }

    // 更新数据库
    const data = {
      accessToken: result.data.access_token,
      expiredAt: Math.floor(Date.now() / 1000) + result.data.expires_in,
      lastUpdate: new Date()
    };

    await ctx.mpserverless.db.collection('setting').findOneAndUpdate({
      _id: "accessToken"
    }, {
      $set: data
    }, {
      upsert: true  // 如果不存在则创建
    });

    console.log("获取新 token 成功");
    return result.data.access_token;

  } catch (error) {
    console.error("获取 access_token 失败:", error);
    
    // 如果获取新 token 失败，但缓存中还有未过期的 token，尝试使用缓存
    if (record && Math.floor(Date.now() / 1000) < record.expiredAt) {
      console.log("获取新 token 失败，使用缓存 token");
      return record.accessToken;
    }
    
    throw error;
  }
}
