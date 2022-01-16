// 负责用户表的管理、使用接口
import { async } from './packages/regenerator-runtime/runtime.js';
import { randomInt, userInfoEq } from './utils.js';

// 获取当前用户
// 如果数据库中没有会后台自动新建并返回
function getUser() {
  return new Promise(resolve => {
    wx.cloud.callFunction({
      name: 'userOp',
      data: {
        op: 'get'
      },
      success: (res) => {
        console.log(res);
        resolve(res.result);
      }
    });
  });
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
  const key = "uinfo-" + openid;
  var value = wx.getStorageSync(key);
  if (value && (new Date(value.expireDate)) > (new Date())) {
    // 没有过期
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
  let timestamp = new Date().getTime();
  timestamp = timestamp + randomInt(25, 35) * (60 * 1000);
  value.expireDate = new Date(timestamp);
  wx.setStorageSync(key, value);

  return value;
}

module.exports = {
  getUser,
  getCurUserInfoOrFalse,
  getUserInfo,
} 