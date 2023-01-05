// deleteFiles 删除云储存文件
// SDK: http://docs.minio.org.cn/docs/master/javascript-client-api-reference#removeObject

import cloud from '@/cloud-sdk'
const Minio = require('minio')

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx
  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  
  const { LAF_OSS_URL, LAF_PORT, LAF_BUCKET } = await cloud.invoke("getAppSecret", {});
  const ossPath = `https://${LAF_OSS_URL}:${LAF_PORT}/${LAF_BUCKET}/`

  const fileIDs = ctx.body.fileIDs;
  
  const client = new Minio.Client({
    bucketName: LAF_BUCKET,
    endPoint: LAF_OSS_URL,
    port: LAF_PORT,
    useSSL: true,
    accessKey: cloud.env.OSS_ACCESS_KEY,
    secretKey: cloud.env.OSS_ACCESS_SECRET,
  });
  for (var idx in fileIDs) {
    const fileName = fileIDs[idx].substring(ossPath.length);
    await client.removeObject(LAF_BUCKET, fileName, function (err) {
      if (err) {
        console.log('Unable to remove object', err);
      }
    });
    console.log('Removed the object', fileName, 'from bucket', LAF_BUCKET);
  }
}