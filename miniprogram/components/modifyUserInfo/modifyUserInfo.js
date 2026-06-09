import { getUser } from "../../utils/user";
import { deepcopy } from "../../utils/utils";
import api from "../../utils/cloudApi";
import { uploadFile } from "../../utils/common";
import { removeCacheItem } from '../../utils/cache';
const app = getApp();

Component({
  data: {
    defaultAvatarUrl: "/pages/public/images/info/default_avatar.png",
    user: null,
    privacyAuthorized: false,  // 是否已通过隐私协议授权
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
      observer: function (newVal, oldVal) {
        if (newVal && !oldVal) {
          this.loadUser();
        }
      }
    }
  },

  lifetimes: {
    attached() {
      this._checkPrivacyAuthorized();
    }
  },

  methods: {
    // 检查隐私协议是否已授权
    _checkPrivacyAuthorized() {
      if (typeof wx.getPrivacySetting !== 'function') {
        // 低版本基础库不支持隐私 API，直接放行
        this.setData({ privacyAuthorized: true });
        return;
      }
      wx.getPrivacySetting({
        success: (res) => {
          // needAuthorization 为 false 表示已同意过，直接放行
          this.setData({ privacyAuthorized: !res.needAuthorization });
        },
        fail: () => {
          this.setData({ privacyAuthorized: true });
        }
      });
    },

    // 未授权时点击头像区域，先弹隐私授权弹窗
    onTapAvatarBeforeAuth() {
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        this.setData({ privacyAuthorized: true });
        return;
      }
      wx.requirePrivacyAuthorize({
        success: () => {
          this.setData({ privacyAuthorized: true });
          // 授权完成后提示用户再次点击头像选取
          wx.showToast({ title: '请再次点击头像选取', icon: 'none', duration: 1500 });
        },
        fail: () => {
          wx.showModal({
            title: '需要隐私授权',
            content: '选取头像需要您同意隐私协议，请在弹窗中点击"同意"后再试。',
            showCancel: false,
            confirmText: '知道了',
          });
        }
      });
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

      var fileInfo = await this.uploadAvatar(user.userInfo.avatarUrl);
      user.userInfo.avatarUrl = fileInfo.fileUrl;
      user.userInfo.avatarUrlId = fileInfo.fileId;

      console.log(user);

      // 更新数据库的userInfo
      await api.userOp({
        op: 'update',
        user: user
      });

      wx.hideLoading();

      // 发布更新事件
      removeCacheItem("current-user");
      app.globalData.eventBus.$emit('userInfoUpdated');

      this.hide();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      this.triggerEvent('userInfoUpdated', { user: user });
    },

    async uploadAvatar(tempFilePath) {
      const openid = this.data.user.openid;
      if (!tempFilePath.includes("://tmp")) {
        return { fileId: this.data.user.userInfo.avatarUrlId, fileUrl: tempFilePath };
      }

      //获取后缀
      const index = tempFilePath.lastIndexOf(".");
      const ext = tempFilePath.substr(index + 1);
      // 上传图片
      let upRes = await uploadFile({
        filePath: tempFilePath, // 小程序临时文件路径
        cloudPath: `/user/avatar/${openid}.${ext}`, // 上传至云端的路径
      })

      console.log('upRes', upRes);

      return { fileId: upRes.fileId, fileUrl: upRes.fileUrl };
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