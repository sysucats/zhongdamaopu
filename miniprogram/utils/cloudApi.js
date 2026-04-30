// 存放所有需要调用云函数的接口
import config from "../config";

function getDate(date) {
  date = date ? new Date(date) : new Date();
  return new Date()
}


// 获取当前用户的openid
async function getCurrentUserOpenid() {
  try {
    const app = getApp();
    console.log("App instance:", app);
    const res = await app.mpServerless.user.getInfo({
      authProvider: 'wechat_openapi'
    });
    if (res.success) {
      return res.result.user.oAuthUserId;
    }
    return null;
  } catch (error) {
    console.log("getCurrentUserOpenid error:", error);
    return null;
  }
}

async function curdOp(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "curdOp",
  })).result;
}

async function userOp(options) {
  const app = getApp();
  var openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    op: options.op,
    unionAction: "userOp",
  })).result;
}
// 发送消息

async function sendMsgV2(options) {
  const app = getApp();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    unionAction: "sendMsgV2",
  })).result;
}

async function getMpCode(options) {
  const app = getApp();
  const params = {
    _id: options._id,
    scene: options.scene,
    page: options.page,
    width: 500,
    use_private_tencent_cos: config.use_private_tencent_cos
  }
  return (await app.mpServerless.function.invoke('unionOp', {
    ...params,
    unionAction: "getMpCode",
  })).result;
}

async function managePhoto(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "managePhoto",
  })).result
}

async function getAllSci(options) {
  const app = getApp();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    unionAction: "getAllSci",
  })).result;
}

async function updateCat(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "updateCat",
  })).result
}

// 内容安全检查
async function contentSafeCheck(content, nickname) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  const label_type = {
    100: "正常",
    10001: "广告",
    20001: "时政",
    20002: "色情",
    20003: "辱骂",
    20006: "违法犯罪",
    20008: "欺诈",
    20012: "低俗",
    20013: "版权",
    21000: "其他",
  }
  // 违规检测并提交
  var res = (await app.mpServerless.function.invoke('unionOp', { openid: openid, content: content, nickname: nickname, unionAction: "commentCheck" })).result;
  // 检测接口的返回
  console.log("contentSafeCheck", res);
  if (res.errCode != 0 && res.errcode != 0) {
    return {
      title: "内容检测未通过",
      content: `接口访问错误，错误码${res.errcode}`,
      showCancel: false,
    };
  }

  const label_code = res.result.label;
  const label = label_type[label_code];
  if (label_code != 100) {
    return {
      title: "内容检测未通过",
      content: `涉及[${label_code}]${label}内容，请修改嗷~~`,
      showCancel: false,
    };
  }
  return;
}
// 获取用户的徽章
async function getBadge(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "getBadge",
  })).result
}
// 添加app实例获取
async function giveBadge(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "giveBadge",
  })).result
}
// 生成徽章二维码
async function genBadgeCode(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "genBadgeCode",
  })).result
}
// 加载徽章码
async function loadBadgeCode(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "curdOp",
    operation: "read",
    collection: "badge_code",
    where: options.where,
    skip: options.skip,
    limit: options.limit
  })).result
}

// 添加app实例获取
// 查询用户个人数据接口
async function getUserStats(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  console.log("openid", openid);
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "getUserStats",
  })).result
}

// 更新一只猫的评分
async function updateCatRating(options) {
  const app = getApp();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    unionAction: "updateCatRating",
  })).result
}

// 添加app实例获取
async function getCatStats(options) {
  const app = getApp();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    unionAction: "getCatStats",
  })).result
}

// 更新关注列表
// 添加app实例获取
async function updateFollowCats(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "updateFollowCats",
  })).result
}

// 更新一只猫的疫苗接种记录
async function vaccineOp(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "vaccineOp",
  })).result
}

// 更新猫的关系
async function catRelationOp(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "catRelationOp",
  })).result;
}

// 管理关系规则
async function manageRelationRules(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "manageRelationRules",
  })).result;
}

// 初始化疫苗类型
async function initVaccineTypes(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "initVaccineTypes",
  })).result;
}

// 获取URL
async function getURL(options) {
  const app = getApp();
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    openid: openid,
    unionAction: "getURL",
  })).result;
}

async function getTempCOS(options) {
  const app = getApp();
  console.log("getTempCOS", options, app);
  return (await app.mpServerless.function.invoke('unionOp', {
    ...options,
    unionAction: "getTempCOS",
  })).result;
}


module.exports = {
  curdOp,
  userOp,
  sendMsgV2,
  getMpCode,
  managePhoto,
  getAllSci,
  contentSafeCheck,
  updateCat,
  getDate,
  getBadge,
  giveBadge,
  genBadgeCode,
  loadBadgeCode,
  getUserStats,
  updateCatRating,
  getCatStats,
  updateFollowCats,
  vaccineOp,
  catRelationOp,
  manageRelationRules,
  initVaccineTypes,
  getURL,
  getTempCOS,
  getCurrentUserOpenid
};
