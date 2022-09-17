// pages/info/userInfo/ModifyUserInfo/ModifyUserInfo.js
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const userUtils = require("../../../../user.js");
const cloud = require("../../../../cloudAccess.js").cloud;
const utils = require("../../../../utils.js");

Page({
  data: {
    defaultAvatarUrl: defaultAvatarUrl,
    user: null,
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail 
    this.setData({
      "user.userInfo.avatarUrl": avatarUrl,
    });
  },

  onChangeNickName(e) {
    const { value } = e.detail;
    console.log(e);
    this.setData({
      "user.userInfo.nickName": value,
    });
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    var user = await userUtils.getUser();
    if (!user.userInfo) {
      user.userInfo = {};
    }
    this.setData({
      user: user
    });
  },

  async clickUpload() {
    wx.showLoading({
      title: '保存中...',
    });

    var user = this.data.user;
    const openid = user.openid;
    if (!openid) {
      wx.showToast({
        title: '获取openid失败',
        icon: "error"
      });
      return false;
    }

    if(!this.checkNickName(user.userInfo.nickName)) {
      return false;
    }

    user.userInfo.avatarUrl = await this.uploadAvatar(user.userInfo.avatarUrl);

    console.log(user);
    this.setData({user});
    
    // 更新数据库的userInfo
    await cloud.callFunction({
      name: 'userOp',
      data: {
        op: 'update',
        user: user
      }
    });

    wx.hideLoading();
    wx.navigateBack();
  },

  async uploadAvatar(tempFilePath) {
    const openid = this.data.user.openid;
    if (! tempFilePath.includes("://tmp")) {
      return tempFilePath;
    }
    
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);
    // 上传图片
    let upRes = await cloud.uploadFile({
      cloudPath: `user/avatar/${openid}.${ext}`, // 上传至云端的路径
      filePath: tempFilePath, // 小程序临时文件路径
    });
    return upRes.fileID;
  },

  async checkNickName(name) {
    if (name.length > 30) {
      wx.showToast({
        title: '昵称太长啦...20字',
      });
      return false;
    }
    const checkRes = await utils.contentSafeCheck("empty", name);
    if (!checkRes) {
      return true;
    }
    wx.showModal(checkRes);
    return false;
  },
})