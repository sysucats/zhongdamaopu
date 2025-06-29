module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const {
    result: app_secret
  } = await ctx.mpserverless.db.collection('app_secret').findOne()

  // 读取数据库
  const {
    result: record
  } = await ctx.mpserverless.db.collection('setting').findOne({
    _id: "accessToken"
  });
  if (record && Math.floor(Date.now() / 1000) < record.expiredAt) {
    // 未超时，直接返回
    console.log("未超时，直接返回", record);
    return record.accessToken;
  }


  // 重新获取
  const result = await ctx.httpclient.request('https://api.weixin.qq.com/cgi-bin/token', {
    method: 'GET',
    data: {
      appid: app_secret.MP_APPID,
      secret: app_secret.MP_SECRET,
      grant_type: 'client_credential'
    },
    dataType: 'json'
  });

  if (result.status !== 200) { // 获取失败
    console.log("Access Token 获取失败 ", result.data);
    return result.data;
  }
  // 更新数据库
  const data = {
    accessToken: result.data.access_token,
    expiredAt: Math.floor(Date.now() / 1000) + result.data.expires_in
  };
  await ctx.mpserverless.db.collection('setting').findOneAndUpdate({
    _id: "accessToken"
  }, {
    $set: data
  })

  return data.accessToken;
}