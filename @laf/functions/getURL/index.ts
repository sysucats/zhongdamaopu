// getURL 为前端上传文件创建东西

import cloud from '@/cloud-sdk'
const Minio = require('minio')

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  const { fileName } = ctx.body;
  return await signUrl(fileName);
}

// 签名方法
async function signUrl(fileName: string) {
  // minIO 配置
  const { LAF_OSS_URL, LAF_PORT, LAF_BUCKET, OSS_SECRET_ID, OSS_SECRET_KEY } = await cloud.invoke("getAppSecret", {});
  console.log(OSS_SECRET_ID, OSS_SECRET_KEY)
  console.log(LAF_OSS_URL, LAF_PORT, LAF_BUCKET)
  console.log(cloud.env)
  
  // 报错"Invalid endPoint"请参考: https://blog.csdn.net/xinleicol/article/details/115698599
  const client = new Minio.Client({
    bucketName: LAF_BUCKET,
    endPoint: LAF_OSS_URL,
    port: LAF_PORT,
    useSSL: true,
    accessKey: OSS_SECRET_ID || cloud.env.OSS_ACCESS_KEY,
    secretKey: OSS_SECRET_KEY || cloud.env.OSS_ACCESS_SECRET,
  });
  return new Promise((resolve, reject) => {
    let policy = client.newPostPolicy()
    policy.setBucket(LAF_BUCKET)
    policy.setKey(fileName)
    let expires = new Date()
    // 10d
    expires.setSeconds(24 * 60 * 60 * 10);
    policy.setExpires(expires)
    client.presignedPostPolicy(policy, function (err, data) {
      if (err)
        return console.log(err)
      resolve(data)
    })
  })
}