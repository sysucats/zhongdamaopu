module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const photoUrls = ctx.args.photoUrls;
  return await deleteFiles(photoUrls);

  async function deleteFiles(photoUrls) {
    const COS = require('cos-nodejs-sdk-v5');

    const {
      result: app_secret
    } = await ctx.mpserverless.db.collection('app_secret').findOne();
    const {
      OSS_ENDPOINT,
      OSS_BUCKET,
      OSS_SECRET_ID,
      OSS_SECRET_KEY
    } = app_secret;

    const region = OSS_ENDPOINT.split('.')[1];
    const cos = new COS({
      SecretId: OSS_SECRET_ID,
      SecretKey: OSS_SECRET_KEY,
    });

    try {
      for (const url of photoUrls) {
        if (!url.includes(OSS_ENDPOINT)) {
          continue;
        }
        const fileName = getFilePath(url, OSS_BUCKET, region);
        const result = {
          url,
          fileName,
          success: false,
          error: null
        };
        try {
          // 删除文件
          await new Promise((resolve, reject) => {
            cos.deleteObject({
                Bucket: OSS_BUCKET,
                Region: region,
                Key: fileName,
              },
              (err, data) => {
                if (err) {
                  result.error = err.message;
                  reject(err);
                } else {
                  result.success = true;
                  result.response = data;
                  resolve(data);
                }
              }
            );
          });
        } catch (err) {
          result.error = err.message || 'Unknown error';
        }
      }
      return {
        success: true
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Unknown error'
      };
    }
  }

  function getFilePath(fullPath) {
    // 假设 URL 格式为 `https://<bucket-name>.cos.<region>.myqcloud.com/<file-path>`
    const url = new URL(fullPath);
    return decodeURIComponent(url.pathname.slice(1));
  }
};