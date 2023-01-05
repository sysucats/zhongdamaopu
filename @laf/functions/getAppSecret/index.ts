

import cloud from '@/cloud-sdk'

const db = cloud.database();

async function ensureShared() {
  if (cloud.shared["app_secret"]) {
    return;
  }
  cloud.shared["app_secret"] = (await db.collection('app_secret').get()).data[0];
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  if (body && body.reset === true) {
    cloud.shared["app_secret"] = null;
    return;
  }
  await ensureShared();
  return cloud.shared["app_secret"];
}
