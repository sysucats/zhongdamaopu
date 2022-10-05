// 负责用户表的管理、使用接口
import { randomInt, userInfoEq } from './utils';
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

async function getCurUserInfoOrFalse() {
  if (!wx.getUserProfile) { // 如果不支持新接口，直接使用数据库中的旧数据，若无数据则提醒用户
    var user = await getUser();
    if (!user.userInfo) {
      wx.showToast({
        title: '当前微信版本不支持登陆，请先使用手机较新版本微信登陆',
        icon: 'none'
      });
      return false;
    }
    return user;
  }
  // 使用新接口
  var res = await new Promise(resolve => {
    wx.getUserProfile({
      desc: '获取你的头像和昵称',
      success(res) {
        resolve(res);
      },
      fail(err) {
        console.log('failed getUserProfile', err);
        resolve(false);
      }
    })
  });
  if (!res) {
    return false;
  }
  var user = await getUser();
  console.log(user);
  if (!user.userInfo || !userInfoEq(res.userInfo, user.userInfo)) {
    // 如果userInfo有更新，那么就更新数据库中的userInfo并返回更新后的
    console.log('需要更新');
    user.userInfo = res.userInfo;
    // 更新数据库的userInfo
    wx.cloud.callFunction({
      name: 'userOp',
      data: {
        op: 'update',
        user: user
      }
    });
  }

  // 合并重要属性
  res.openid = user.openid;
  res.cantComment = user.cantComment;

  return res;
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

/*
* 检查是否开启上传通道（返回true为开启上传）
*/
async function checkCanUpload() {
  // 加载设置、关闭上传功能
  const app = getApp();
  let cantUpload = (await getGlobalSettings('detailCat')).cantUpload;
  if ((cantUpload !== '*') && (cantUpload !== app.globalData.version)) {
    return true;
  }
  
  if (cantUpload == 'ALL') {
    // 完全关闭上传
    return await managerUpload();
  }

  // 特邀用户
  const user = await getUser();
  if (user.role == 1) {
    return true;
  }

  return await managerUpload();
}

// 看看能否评论
async function checkCanComment() {
  // 加载设置、关闭留言板功能
  const app = getApp();
  let cantComment = (await getGlobalSettings('detailCat')).cantComment;
  if ((cantComment !== '*') && (cantComment !== app.globalData.version)) {
    return true;
  }
  return false;
}


// 设置页面上的userInfo
async function getPageUserInfo(page) {
  // 检查用户信息有没有拿到，如果有就更新this.data
  const userRes = await getCurUserInfoOrFalse();

  if (!userRes) {
    console.log('未授权');
    return false;
  }
  console.log(userRes);
  page.setData({
    isAuth: true,
    user: userRes,
  });
  return true;
}

async function isManagerAsync(req) {
  const user = await getUser;
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
  getCurUserInfoOrFalse,
  getUserInfo,
  checkCanUpload,
  getPageUserInfo,
  checkCanComment,
  isManagerAsync,
  checkAuth,
  toSetUserInfo,
} 