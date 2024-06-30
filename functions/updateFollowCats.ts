import cloud from '@lafjs/cloud'

const db = cloud.mongo.db;

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const openid = ctx.user?.openid;

  if (!openid || !body.updateCmd || !body.catId) {
    console.log("参数不全");
    return false;
  }

  let updateCmd = null, updateCatCount = null;
  if (body.updateCmd == 'add') {
    updateCmd = { $push: { followCats: body.catId } };
    updateCatCount = { $inc: { followCount: 1 } };
  } else if (body.updateCmd == 'del') {
    updateCmd = { $pull: { followCats: body.catId } };
    updateCatCount = { $inc: { followCount: -1 } };
  } else {
    return false;
  }

  console.log(openid, body.updateCmd, body.catId);

  await db.collection("user").updateOne({ openid }, updateCmd);

  // 更新猫猫的关注数
  await db.collection("cat").updateOne({ _id: body.catId }, updateCatCount);

  return true;
}
