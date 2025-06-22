// 存放所有需要调用云函数的接口
import config from "../config";
import { getCurrentUserOpenid } from "./common";
const app = getApp();

function getDate(date) {
  date = date ? new Date(date) : new Date();
  return new Date()
}

async function curdOp(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('curdOp', {
    ...options,
    openid: openid,
  })).result;
}

async function userOp(options) {
  var openid
  const res = await app.mpServerless.user.getInfo({
    authProvider: 'wechat_openapi'
  });
  if (res.success) {
    openid = res.result.user.oAuthUserId;
  } else {
    return {};
  }
  return (await app.mpServerless.function.invoke('userOp', {
    ...options,
    openid: openid,
    op: options.op
  })).result;
}

async function sendMsgV2(options) {
  return (await app.mpServerless.function.invoke('sendMsgV2', options)).result;
}

async function getMpCode(options) {
  const params = {
    _id: options._id,
    scene: options.scene,
    page: options.page,
    width: 500,
    use_private_tencent_cos: config.use_private_tencent_cos
  }
  return (await app.mpServerless.function.invoke('getMpCode', params)).result;
}

async function managePhoto(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('managePhoto', {
    ...options,
    openid: openid
  })).result
}

// EMAS不支持该功能
// async function globalLock(options) {
//   return await cloud.callFunction({
//     name: "globalLock",
//     data: options
//   });
// }

async function getAllSci(options) {
  return (await app.mpServerless.function.invoke('getAllSci', options)).result;
}

async function updateCat(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('updateCat', {
    ...options,
    openid: openid
  })).result
}

// 内容安全检查
async function contentSafeCheck(content, nickname) {
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
  var res = (await app.mpServerless.function.invoke('commentCheck', { openid: openid, content: content, nickname: nickname })).result;
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

async function getBadge(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('getBadge', {
    ...options,
    openid: openid
  })).result
}

async function giveBadge(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('giveBadge', {
    ...options,
    openid: openid
  })).result
}

async function genBadgeCode(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('genBadgeCode', {
    ...options,
    openid: openid
  })).result
}

async function loadBadgeCode(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('curdOp', {
    ...options,
    openid: openid,
    operation: "read",
    collection: "badge_code",
    where: options.where,
    skip: options.skip,
    limit: options.limit
  })).result
}

// 查询用户个人数据接口
async function getUserStats(options) {
  const openid = await getCurrentUserOpenid();
  console.log("openid", openid);
  return (await app.mpServerless.function.invoke('getUserStats', {
    ...options,
    openid: openid
  })).result
}

// 更新一只猫的评分
async function updateCatRating(options) {
  return (await app.mpServerless.function.invoke('updateCatRating', options)).result
}

// 更新关注列表
async function updateFollowCats(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('updateFollowCats', {
    ...options,
    openid: openid
  })).result
}

async function vaccineOp(options) {
  const openid = await getCurrentUserOpenid();
  return (await app.mpServerless.function.invoke('vaccineOp', {
    ...options,
    openid: openid
  })).result
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
  updateFollowCats,
  vaccineOp
};
