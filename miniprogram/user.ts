// 负责用户表的管理、使用接口
import { userInfoEq } from './utils';

// 获取当前用户
// 如果数据库中没有会后台自动新建并返回
export function getUser() {
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

export async function getUserInfoOrFalse() {
  if (!wx.getUserProfile) { // 如果不支持新接口，直接使用数据库中的旧数据，若无数据则提醒用户
    const user = await getUser();
    if (!user.userInfo) {
      wx.showToast({
        title: '当前微信版本不支持登陆，请先使用手机较新版本微信登陆',
        icon: 'none'
      });
      return false;
    }
    return user;
  } else { // 使用新接口
    try {
      const res = await wx.getUserProfile({  desc: '获取你的头像和昵称' })
      const user = await getUser()
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
      return res
    } catch (error) {
      console.log('failed getUserProfile', error);
      return false
    }
  }
}