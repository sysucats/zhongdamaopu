// 存放所有需要调用云函数的接口
import { cloud } from "./cloudAccess";

function getDate(date) {
  date = date ? new Date(date): new Date();
  return {
    "$date": new Date()
  }
}

async function curdOp(options) {
  return await cloud.callFunction({
    name: "curdOp",
    data: options
  });
}

async function userOp(options) {
  return await cloud.callFunction({
    name: "userOp",
    data: options
  });
}

async function sendMsgV2(options) {
  return await cloud.callFunction({
    name: "sendMsgV2",
    data: options
  });
}

async function getMpCode(options) {
  return await cloud.callFunction({
    name: "getMpCode",
    data: options
  });
}

async function managePhoto(options) {
  return await cloud.callFunction({
    name: "managePhoto",
    data: options
  });
}

async function globalLock(options) {
  return await cloud.callFunction({
    name: "globalLock",
    data: options
  });
}

async function getAllSci(options) {
  return await cloud.callFunction({
    name: "getAllSci",
    data: options
  });
}

async function updateCat(options) {
  return await cloud.callFunction({
    name: "updateCat",
    data: options
  });
}

// 内容安全检查
async function contentSafeCheck(content, nickname) {
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
  var res = (await cloud.callFunction({
    name: 'commentCheck',
    data: {
      content: content,
      nickname: nickname,
    },
  })).result;
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
  return await cloud.callFunction({
    name: "getBadge",
    data: options
  });
}

async function giveBadge(options) {
  return await cloud.callFunction({
    name: "giveBadge",
    data: options
  });
}

async function genBadgeCode(options) {
  return await cloud.callFunction({
    name: "genBadgeCode",
    data: options
  });
}

async function loadBadgeCode(options) {
  return await cloud.callFunction({
    name: "curdOp",
    data: {
      operation: "read",
      collection: "badge_code",
      where: options.where,
      skip: options.skip,
      limit: options.limit,
      orderBy: options.orderBy,
    }
  });
}

// 查询用户个人数据接口
async function getUserStats(options) {
  return await cloud.callFunction({
    name: "getUserStats",
    data: options
  });
}

// 更新一只猫的评分
async function updateCatRating(options) {
  return await cloud.callFunction({
    name: "updateCatRating",
    data: options
  });
}

// 更新关注列表
async function updateFollowCats(options) {
  return await cloud.callFunction({
    name: "updateFollowCats",
    data: options
  });
}

module.exports = {
  curdOp,
  userOp,
  sendMsgV2,
  getMpCode,
  managePhoto,
  globalLock,
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
};
