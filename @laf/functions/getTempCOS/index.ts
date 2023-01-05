// 获取临时的腾讯云Cos secretID、Key，只能用于get

import cloud from '@/cloud-sdk'
import { sts } from 'tencentcloud-sdk-nodejs'

const StsClient = sts.v20180813.Client;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  // 看看是否有缓存
  const cache = cloud.shared['TempCOS'];
  // const cache = null;
  if (cache && cache.Expiration && (new Date() < new Date(cache.Expiration))) {
    console.log("cache valid");
    return cache;
  }

  // COS 配置
  const { LAF_OSS_URL, LAF_BUCKET, OSS_SECRET_ID, OSS_SECRET_KEY } = await cloud.invoke("getAppSecret", {});

  const region = LAF_OSS_URL.split('.')[1];

  const res = await getTempUrl(OSS_SECRET_ID, OSS_SECRET_KEY, region, LAF_BUCKET);
  cloud.shared['TempCOS'] = res;
  return res;
}

async function getTempUrl(secretId: string, secretKey: string, region: string, bucket: string) {
  const uid = bucket.split('-')[1]
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
    "Policy": `{"version":"2.0","statement":[{"effect":"allow","action":["name/cos:GetObject"],"resource":["qcs::cos:${region}:uid/${uid}:${bucket}/*"]}]}`
  };
  return await client.GetFederationToken(params);
}