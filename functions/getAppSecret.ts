import cloud from '@lafjs/cloud'

async function ensureShared() {
  if (cloud.shared["app_secret"]) {
    return;
  }

  // MP
  const MP_APPID = process.env.MP_APPID;
  const MP_SECRET = process.env.MP_SECRET;
  
  var OSS_ENDPOINT = process.env.OSS_ENDPOINT || process.env.OSS_EXTERNAL_ENDPOINT;
  if (OSS_ENDPOINT.startsWith("https://")) {
    OSS_ENDPOINT = OSS_ENDPOINT.substr(8);
  }
  const OSS_PORT = parseInt(process.env.OSS_PORT) || 443;
  const OSS_BUCKET = process.env.OSS_BUCKET;

  const OSS_SECRET_ID = process.env.OSS_SECRET_ID || process.env.OSS_ACCESS_KEY;
  const OSS_SECRET_KEY = process.env.OSS_SECRET_KEY || process.env.OSS_ACCESS_SECRET;

  cloud.shared["app_secret"] = {
    OSS_ENDPOINT: OSS_ENDPOINT.trim(),
    OSS_PORT,
    OSS_BUCKET: OSS_BUCKET.trim(),
    MP_APPID: MP_APPID.trim(),
    MP_SECRET: MP_SECRET.trim(),
    OSS_SECRET_ID: OSS_SECRET_ID.trim(),
    OSS_SECRET_KEY: OSS_SECRET_KEY.trim(),
  }
}

export async function getAppSecret(reset: boolean) {
  if (reset) {
    cloud.shared["app_secret"] = null;
    cloud.shared['TempCOS'] = null;
  }
  await ensureShared();
  return cloud.shared["app_secret"];
}

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.2";
  }

  return await getAppSecret(body && body.reset);
}
