module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const Minio = require('minio');
  const fileName = ctx.args.fileName;
  return await signUrl(fileName);
  // 签名方法
  async function signUrl(fileName) {
    // minIO 配置
    const {
      result: app_secret
    } = await ctx.mpserverless.db.collection('app_secret').findOne()
    const {
      OSS_ENDPOINT,
      OSS_PORT,
      OSS_BUCKET,
      OSS_SECRET_ID,
      OSS_SECRET_KEY
    } = app_secret;

    // 报错"Invalid endPoint"请参考: https://blog.csdn.net/xinleicol/article/details/115698599
    const minioClient = {
      endPoint: OSS_ENDPOINT,
      port: OSS_PORT,
      useSSL: true,
      accessKey: OSS_SECRET_ID,
      secretKey: OSS_SECRET_KEY,
      pathStyle: false,
    }
    // if (OSS_ENDPOINT == "oss.laf.run") {
    //     minioClient.pathStyle = true
    // }
    const client = new Minio.Client(minioClient);
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

}