// 负责用户表的管理、使用接口
import { randomInt } from './utils';
import { getGlobalSettings } from "./page";
import { getCacheItem, setCacheItem } from "./cache";

// 获取当前用户
// 如果数据库中没有会后台自动新建并返回
async function getUser(options) {
  options = options || {};
  const app = getApp();

  if (!options.nocache) {
    if (app.globalData.currentUser) {
      return app.globalData.currentUser
    }
  }

  const userRes = await wx.cloud.callFunction({
    name: 'userOp',
    data: {
      op: 'get'
    }
  });
  app.globalData.currentUser = userRes.result;
  return userRes.result;
}

// 使用openid来读取用户信息
async function getUserInfo(openid) {
  const key = `uinfo-${openid}`;
  var value = getCacheItem(key);
  if (value != undefined) {
    return value;
  }

  // 重新获取
  const db = wx.cloud.database();
  const coll_user = db.collection('user');
  value = (await coll_user.where({openid: openid}).get()).data[0];

  if (value.length === 0) {
    console.log("user " + openid + " not existed.");
    return null;
  }

  // 写入缓存（25-35min过期）
  setCacheItem(key, value, 0, randomInt(25, 35));

  return value;
}

async function _checkFuncEnable(func) {
  var funcToSettingName = {
    "uploadImage": "cantUpload",
    "comment": "cantComment",
  }
  // 加载设置、关闭上传功能
  const app = getApp();
  var funcSetting = funcToSettingName[func];
  let banSetting = (await getGlobalSettings('detailCat'))[funcSetting];
  if ((banSetting !== '*') && (banSetting !== app.globalData.version)) {
    return true;
  }
  
  if (banSetting == 'ALL') {
    // 完全关闭上传
    return await isManagerAsync();
  }

  // 特邀用户
  const user = await getUser();
  if (user.role == 1) {
    return true;
  }

  return await isManagerAsync();
}

/*
* 检查是否开启上传通道（返回true为开启上传）
*/
async function checkCanUpload() {
  return await _checkFuncEnable("uploadImage");
}

// 看看能否评论
async function checkCanComment() {
  return await _checkFuncEnable("comment");
}


// 设置页面上的userInfo
async function getPageUserInfo(page) {
  // 检查用户信息有没有拿到，如果有就更新this.data
  const userRes = await getUser();
  
  console.log(userRes);
  if (!userRes.userInfo || !userRes.userInfo.length) {
    console.log('无用户信息');
    return false;
  }
  page.setData({
    isAuth: true,
    user: userRes,
  });
  return true;
}

async function isManagerAsync(req) {
  const user = await getUser();
  if (!req) {
    req = 1;
  }
  return user.manager && user.manager >= req;
}

// TODO，应该做成一个模块
async function checkAuth(page, level) {
  if (await isManagerAsync(level)) {
    page.setData({
      auth: true
    });
    return true;
  }
  
  page.setData({
    tipText: `只有管理员Level-${level}能进入嗷`,
    tipBtn: true,
  });
  return false;
}

// 去设置用户信息页
function toSetUserInfo() {
  const url = "/pages/info/userInfo/modifyUserInfo/modifyUserInfo";
  console.log(url);
  wx.navigateTo({
    url: url,
  })
}


module.exports = {
  getUser,
  getUserInfo,
  checkCanUpload,
  getPageUserInfo,
  checkCanComment,
  isManagerAsync,
  checkAuth,
  toSetUserInfo,
} 