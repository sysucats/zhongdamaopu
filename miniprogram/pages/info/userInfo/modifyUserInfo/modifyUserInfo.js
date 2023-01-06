import { getUser } from "../../../../user";
import { deepcopy } from "../../../../utils";
import { cloud } from "../../../../cloudAccess";
import api from "../../../../cloudApi";

const defaultAvatarUrl = "/pages/public/images/info/default_avatar.png"

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
    await this.loadUser();
  },

  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);
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

    if (!user.userInfo.avatarUrl) {
      user.userInfo.avatarUrl = defaultAvatarUrl;
    }

    user.userInfo.avatarUrl = await this.uploadAvatar(user.userInfo.avatarUrl);

    console.log(user);
    
    // 更新数据库的userInfo
    await api.userOp({
      op: 'update',
      user: user
    });

    wx.hideLoading();
    await this.loadUser();
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
    const checkRes = await api.contentSafeCheck("empty", name);
    if (!checkRes) {
      return true;
    }
    wx.showModal(checkRes);
    return false;
  }
})