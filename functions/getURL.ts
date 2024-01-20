import cloud from '@lafjs/cloud'
import { getAppSecret } from "@/getAppSecret"

import * as Minio from 'minio';

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }
  const { fileName } = ctx.body;
  return await signUrl(fileName);
}

// 签名方法
async function signUrl(fileName: string) {
  // minIO 配置
  const { OSS_ENDPOINT, OSS_PORT, OSS_BUCKET, OSS_SECRET_ID, OSS_SECRET_KEY } = await getAppSecret(false);
  
  // 报错"Invalid endPoint"请参考: https://blog.csdn.net/xinleicol/article/details/115698599
  const client = new Minio.Client({
    bucketName: OSS_BUCKET,
    endPoint: OSS_ENDPOINT,
    port: OSS_PORT,
    useSSL: true,
    accessKey: OSS_SECRET_ID,
    secretKey: OSS_SECRET_KEY,
  });
  return new Promise((resolve, reject) => {
    let policy = client.newPostPolicy()
    policy.setBucket(OSS_BUCKET)
    policy.setKey(fileName)
    let expires = new Date()
    // 10d
    expires.setSeconds(24 * 60 * 60 * 10);
    policy.setExpires(expires)
    client.presignedPostPolicy(policy, function (err, data) {
      if (err) {
        reject(err);
        return
      }

      resolve(data)
    })
  })
}