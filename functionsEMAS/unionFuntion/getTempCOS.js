module.exports = async (ctx) => {
  const {
    triggerName
  } = ctx.args;

  const {
    result: record
  } = await ctx.mpserverless.db.collection('setting').findOne({
    _id: "tempCOSToken"
  });

  if (!triggerName && (record && Math.floor(Date.now() / 1000) < record.expiredAt)) {
    return record.tempCOSToken;
  }

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

    const client = new StsClient(clientConfig);
    const params = {
      "Name": "GetFederationToken",
      "Policy": `{"version":"2.0","statement":[{"effect":"allow","action":["name/cos:GetObject"],"resource":["qcs::cos:${region}:uid/${uid}:${bucket}/*"]}]}`,
      "DurationSeconds": 7200,
    };

    const tempCOSToken = await client.GetFederationToken(params);

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
