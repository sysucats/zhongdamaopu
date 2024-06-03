import { getUser } from "../../utils/user";
import { deepcopy } from "../../utils/utils";
import { cloud } from "../../utils/cloudAccess";
import api from "../../utils/cloudApi";

Component({
  data: {
    defaultAvatarUrl: "/pages/public/images/info/default_avatar.png",
    user: null,
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
      observer: function(newVal, oldVal) {
        if (newVal && !oldVal) {
          this.loadUser();
        }
      }
    }
  },

  lifetimes: {
  },

  methods: {
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

      if (!await this.checkNickName(user.userInfo.nickName)) {
        wx.hideLoading();
        return false;
      }
    
      if (!user.userInfo.avatarUrl) {
        wx.showToast({
          title: '请选择头像',
          icon: 'error',
        });
        wx.hideLoading();
        return false;
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
      this.hide();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      this.triggerEvent('userInfoUpdated', { user: user });
      // 重新加载当前页面，获取最新的数据（解决更新后的头像403
      const currentPage = getCurrentPages().pop();
      currentPage.onLoad(currentPage.options);
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
      if (!name) {
        wx.showToast({
          title: '请输入昵称',
          icon: 'error'
        });
        return false;
      }
      if (name.length > 30) {
        wx.showToast({
          title: '昵称太长啦...20字',
          icon: 'error'
        });
        return false;
      }
      const checkRes = await api.contentSafeCheck("empty", name);
      if (!checkRes) {
        return true;
      }
      wx.showModal(checkRes);
      return false;
    },

    // 隐藏
    hide() {
      this.setData({ show: false });
      this.triggerEvent('close');
    }
  }
})