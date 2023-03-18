import cloud from '@lafjs/cloud'

const db = cloud.database();

async function ensureShared() {
  if (cloud.shared["app_secret"]) {
    return;
  }

  // MP
  const MP_APPID = cloud.env.MP_APPID;
  const MP_SECRET = cloud.env.MP_SECRET;
  
  var OSS_ENDPOINT = cloud.env.OSS_ENDPOINT || cloud.env.OSS_EXTERNAL_ENDPOINT;
  if (OSS_ENDPOINT.startsWith("https://")) {
    OSS_ENDPOINT = OSS_ENDPOINT.substr(8);
  }
  const OSS_PORT = cloud.env.OSS_PORT || 443;
  const OSS_BUCKET = cloud.env.OSS_BUCKET;

  const OSS_SECRET_ID = cloud.env.OSS_SECRET_ID || cloud.env.OSS_ACCESS_KEY;
  const OSS_SECRET_KEY = cloud.env.OSS_SECRET_KEY || cloud.env.OSS_ACCESS_SECRET;

  cloud.shared["app_secret"] = {
    OSS_ENDPOINT,
    OSS_PORT,
    OSS_BUCKET,
    MP_APPID,
    MP_SECRET,
    OSS_SECRET_ID,
    OSS_SECRET_KEY,
  }
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  if (body && body.reset === true) {
    cloud.shared["app_secret"] = null;
    cloud.shared['TempCOS'] = null;
  }
  await ensureShared();
  return cloud.shared["app_secret"];
}
