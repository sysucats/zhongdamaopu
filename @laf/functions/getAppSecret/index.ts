

import cloud from '@/cloud-sdk'

const db = cloud.database();

async function ensureShared() {
  if (cloud.shared["app_secret"]) {
    return;
  }
  cloud.shared["app_secret"] = (await db.collection('app_secret').get()).data[0];
}

exports.main = async function (ctx: FunctionContext) {
  await ensureShared();
  return cloud.shared["app_secret"];
}
