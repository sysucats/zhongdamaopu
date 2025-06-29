module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  // 读取缓存
  const {
    triggerName
  } = ctx.args; // 如果是触发器，则有这个参数

  const {
    result: record
  } = await ctx.mpserverless.db.collection('setting').findOne({
    _id: "tempCOSToken"
  });

  if (!triggerName && (record && Math.floor(Date.now() / 1000) < record.expiredAt)) {
    // 未超时，直接返回
    return record.tempCOSToken;
  }

  // 正常获取流程
  const {
    result: app_secret
  } = await ctx.mpserverless.db.collection('app_secret').findOne()
  if (!app_secret) {
    return null;
  }
  const {
    OSS_ENDPOINT,
    OSS_BUCKET,
    OSS_SECRET_ID,
    OSS_SECRET_KEY
  } = app_secret;
  // 没有配置
  if (!(OSS_ENDPOINT && OSS_BUCKET && OSS_SECRET_ID && OSS_SECRET_KEY)) {
    return null;
  }
  const region = OSS_ENDPOINT.split('.')[1];
  const res = await getTempUrl(OSS_SECRET_ID, OSS_SECRET_KEY, region, OSS_BUCKET);
  return res;

  async function getTempUrl(secretId, secretKey, region, bucket) {
    const tencentcloud = require('tencentcloud-sdk-nodejs');
    const {
      Client: StsClient
    } = tencentcloud.sts.v20180813;
    const bucketSegments = bucket.split('-');
    const uid = bucketSegments[bucketSegments.length - 1];
    const clientConfig = {
      credential: {
        secretId: secretId,
        secretKey: secretKey,
      },
      region: region,
      profile: {
        httpProfile: {
          endpoint: `sts.tencentcloudapi.com`,
        },
      },
    };

    // 实例化要请求产品的client对象,clientProfile是可选的
    const client = new StsClient(clientConfig);
    const params = {
      "Name": "GetFederationToken",
      "Policy": `{"version":"2.0","statement":[{"effect":"allow","action":["name/cos:GetObject"],"resource":["qcs::cos:${region}:uid/${uid}:${bucket}/*"]}]}`,
      "DurationSeconds": 7200,
    };

    const tempCOSToken = await client.GetFederationToken(params);

    // 更新数据库
    const data = {
      tempCOSToken,
      expiredAt: Math.floor(Date.now() / 1000) + 3600
    };
    await ctx.mpserverless.db.collection('setting').findOneAndUpdate({
      _id: "tempCOSToken"
    }, {
      $set: data
    }, {
      upsert: true
    })

    return tempCOSToken;
  }
}