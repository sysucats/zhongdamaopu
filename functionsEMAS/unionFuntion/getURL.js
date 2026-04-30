module.exports = async (ctx) => {
  const Minio = require('minio');
  const fileName = ctx.args.fileName;
  return await signUrl(fileName);

  async function signUrl(fileName) {
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

    const minioClient = {
      endPoint: OSS_ENDPOINT,
      port: OSS_PORT,
      useSSL: true,
      accessKey: OSS_SECRET_ID,
      secretKey: OSS_SECRET_KEY,
      pathStyle: false,
    }

    const client = new Minio.Client(minioClient);
    return new Promise((resolve, reject) => {
      let policy = client.newPostPolicy()
      policy.setBucket(OSS_BUCKET)
      policy.setKey(fileName)
      let expires = new Date()
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
