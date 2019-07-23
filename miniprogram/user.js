// 负责用户表的管理、使用接口
import regeneratorRuntime from './packages/regenerator-runtime/runtime.js';
import { userInfoEq } from './utils.js';

// 获取当前用户
// 如果数据库中没有会后台自动新建并返回
function getUser() {
  return new Promise(resolve => {
    const user = wx.cloud.callFunction({
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

function getUserInfoOrFalse() {
  return new Promise(resolve => {
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.userInfo']) {
          // 已经授权
          getUser().then(user => {
            updateUserWithInfo(user).then(res => {
              resolve(res);
            });
          });
        } else {
          // 虽然说可能数据库里也保存了这个user的数据，
          // 但是既然他手动清除了，我们就不应该继续使用
          resolve(false);
        }
      }
    });
  });
}

// 更新当前用户的userInfo
// 需要提前授权，返回update后的
function updateUserWithInfo(user) {
  return new Promise(resolve => {
    // 调用者需要保证已经授权
    wx.getUserInfo({
      success(res) {
        if (!user.userInfo || !userInfoEq(res.userInfo, user.userInfo)) {
          // 如果userInfo有更新，那么就返回更新后的
          console.log('需要更新');
          user.userInfo = res.userInfo;
          wx.cloud.callFunction({
            name: 'userOp',
            data: {
              op: 'update',
              user: user
            }
          });
          resolve(user);
        } else {
          // 没有更新，直接返回原来的
          resolve(user);
        }
      }
    });
  });
}

// 修改用户的微信通知设定
function toggleUserNoticeSetting(user) {
  return new Promise(resolve => {
    user.notice = !user.notice;
    wx.cloud.callFunction({
      name: 'userOp',
      data: {
        op: 'update',
        user: user
      },
      success: (res) => {
        resolve(user);
      }
    });
  });
}

export {
  getUser,
  getUserInfoOrFalse,
  toggleUserNoticeSetting
} 