import cloud from '@lafjs/cloud'
import { sts } from 'tencentcloud-sdk-nodejs'
import { getAppSecret } from "@/getAppSecret"

const StsClient = sts.v20180813.Client;

export default async function (ctx: FunctionContext) {
  // body 为请求参数, user 是授权对象
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  // 看看是否有缓存
  const cache = cloud.shared['TempCOS'];
  // const cache = null;
  if (cache && cache.Expiration && (new Date() < new Date(cache.Expiration))) {
    console.log("cache valid");
    return cache;
  }

  // COS 配置
  const { OSS_ENDPOINT, OSS_BUCKET, OSS_SECRET_ID, OSS_SECRET_KEY } = await getAppSecret(false);

  // 没有配置
  if (!(OSS_ENDPOINT && OSS_BUCKET && OSS_SECRET_ID && OSS_SECRET_KEY)) {
    return null;
  }

  const region = OSS_ENDPOINT.split('.')[1];

  const res = await getTempUrl(OSS_SECRET_ID, OSS_SECRET_KEY, region, OSS_BUCKET);
  cloud.shared['TempCOS'] = res;
  return res;
}

async function getTempUrl(secretId: string, secretKey: string, region: string, bucket: string) {
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
  return await client.GetFederationToken(params);
}