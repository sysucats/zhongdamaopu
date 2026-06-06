import {
  generateUUID,
  getCurrentPath,
  shareTo,
  compressImage
} from "../../../utils/utils";
import {
  getPageUserInfo,
  checkCanUpload,
} from "../../../utils/user";
import {
  requestNotice,
  sendNotifyVertifyNotice
} from "../../../utils/msg";
import config from "../../../config";
import api from "../../../utils/cloudApi";
import { uploadFile } from "../../../utils/common"
import { isDemoMode, getDemoCat } from "../../../utils/demo";

const app = getApp();

Page({
  data: {
    isAuth: false,
    user: {},
    uploading: false,
    birth_date: '2008-01-01',
    photos: [],
    set_all: {},
    canUpload: false,
    text_cfg: config.text,
    showEdit: false,
    location: null,
    locating: false,
    demoMode: false,
  },

  onLoad: async function (options) {
    const cat_id = options.cat_id;
    const demoMode = isDemoMode();
    this.setData({ demoMode });

    if (demoMode) {
      // Demo 模式：使用本地数据
      const catRes = getDemoCat(cat_id);
      this.setData({
        cat: catRes,
        birth_date: catRes.birthday || '',
        canUpload: true,
      });
    } else {
      var catRes = (await app.mpServerless.db.collection('cat').findOne({ _id: cat_id }, { projection: { birthday: 1, name: 1, campus: 1 } })).result;
      this.setData({
        cat: catRes,
        birth_date: catRes.birthday || ''
      });

      this.setData({
        canUpload: await checkCanUpload()
      });
    }

    const today = new Date();
    var now_date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    this.setData({ now_date });

    const device = await wx.getSystemInfoSync();
    this.setData({
      isIOS: device.platform == 'ios'
    });

    this.boundOnUserInfoUpdated = this.onUserInfoUpdated.bind(this);
    app.globalData.eventBus.$on('userInfoUpdated', this.boundOnUserInfoUpdated);
  },

  async onShow() {
    if (isDemoMode()) {
      // Demo 模式：提供 mock 用户信息
      this.setData({
        isAuth: true,
        user: {
          _id: 'demo-user',
          userInfo: {
            avatarUrl: '/pages/public/images/system/user.png',
            nickName: 'Demo猫友'
          }
        }
      });
    } else {
      await getPageUserInfo(this);
    }
  },

  onUnload: async function (options) {
    if (!isDemoMode()) {
      await this.ifSendNotifyVeriftMsg();
    }
    app.globalData.eventBus.$off('userInfoUpdated', this.boundOnUserInfoUpdated);
  },

  async onUserInfoUpdated() {
    if (!isDemoMode()) {
      await getPageUserInfo(this);
    }
  },

  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const share_text = `来给${this.data.cat.name}添加照片 - ${config.text.app_name}`;
    return shareTo(share_text, path);
  },

  async getLocation() {
    if (this.data.locating) return;

    this.setData({ locating: true });

    try {
      // 先请求隐私协议授权（基础库 2.27.1+ 支持）
      await this._requestLocationPrivacy();

      const res = await new Promise((resolve, reject) => {
        wx.getFuzzyLocation({
          type: 'gcj02',
          success: resolve,
          fail: reject
        });
      });

      this.setData({
        location: {
          latitude: res.latitude,
          longitude: res.longitude
        },
        locating: false
      });
    } catch (err) {
      console.log('获取位置失败:', err);
      const title = (err.errMsg || '').includes('privacy') ? '请先同意隐私协议' : '获取位置失败，请检查定位权限';
      wx.showToast({ title, icon: 'none' });
      this.setData({ locating: false });
    }
  },

  _requestLocationPrivacy() {
    return new Promise((resolve) => {
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        resolve();
        return;
      }
      wx.requirePrivacyAuthorize({
        success: resolve,
        fail: () => {
          wx.showModal({
            title: '位置权限说明',
            content: '需要获取您的位置用于记录猫咪照片的拍摄地点，请在隐私协议中同意位置信息授权。',
            showCancel: false,
            confirmText: '知道了'
          });
          resolve(); // 即使用户拒绝，也 resolve，让后续 getFuzzyLocation 自己报错
        }
      });
    });
  },

  async chooseImg(e) {
    if (this.data.uploading) {
      wx.showToast({
        title: '正在上传中，请稍后',
        icon: 'none'
      });
      return;
    }

    var res = await wx.chooseMedia({
      count: config.chooseMediaCount,
      mediaType: ['image'],
      sizeType: ["compressed"],
      sourceType: ['album', 'camera'],
    })
    var photos = [];
    for (var file of res.tempFiles) {
      if (file.size > 512 * 1024) {
        file.path = await compressImage(file.tempFilePath, 30);
        console.log("compressed path:", file.path);
      } else {
        file.path = file.tempFilePath;
      }

      photos.push({
        file: file
      });
    }
    this.setData({
      photos: photos,
      set_all: {},
    });
  },

  // 点击单个上传
  async uploadSingleClick(e) {
    if (this.data.uploading) {
      wx.showToast({
        title: '正在上传中，请稍后',
        icon: 'none'
      });
      return;
    }

    this.setData({ uploading: true });

    try {
      if (!isDemoMode()) {
        await requestNotice('verify');
      }
      wx.showLoading({
        title: config.text.add_photo.success_tip_title,
        mask: true,
      });

      const currentIndex = e.currentTarget.dataset.index;
      const photo = this.data.photos[currentIndex];

      if (photo.uploaded) {
        console.log("照片已上传，跳过");
        return;
      }

      await this.uploadImg(photo);

      photo.uploaded = true;

      this.data.photos = this.data.photos.filter((ph) => {
        return !ph.uploaded;
      });

      this.setData({ photos: this.data.photos });

      wx.hideLoading();
      wx.showModal({
        title: config.text.add_photo.success_tip_title,
        content: config.text.add_photo.success_tip_content,
        showCancel: false
      });
    } catch (error) {
      console.error('上传失败:', error);
      wx.showToast({
        title: '上传失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  // 点击多个上传
  async uploadAllClick(e) {
    if (this.data.uploading) {
      wx.showToast({
        title: '正在上传中，请稍后',
        icon: 'none'
      });
      return;
    }

    const photos = [];
    for (const item of this.data.photos) {
      if (item.shooting_date && item.file.path && !item.uploaded) {
        photos.push(item);
      }
    }

    if (photos.length == 0) {
      wx.showModal({
        title: config.text.add_photo.unfinished_tip_title,
        content: config.text.add_photo.unfinished_tip_content,
        showCancel: false
      });
      return;
    }

    this.setData({ uploading: true });

    try {
      if (!isDemoMode()) {
        await requestNotice('verify');
      }

      for (let i = 0; i < photos.length; ++i) {
        if (photos[i].uploaded) continue;

        wx.showLoading({
          title: '正在上传(' + (i + 1) + '/' + photos.length + ')',
          mask: true,
        });

        await this.uploadImg(photos[i]);

        photos[i].uploaded = true;
      }

      this.data.photos = this.data.photos.filter((ph) => {
        return !ph.uploaded;
      });

      this.setData({ photos: this.data.photos });

      wx.hideLoading();
      wx.showModal({
        title: config.text.add_photo.success_tip_title,
        content: `成功上传 ${photos.length} 张照片`,
        showCancel: false
      });
    } catch (error) {
      console.error('批量上传失败:', error);
      wx.showToast({
        title: '上传过程中出现错误',
        icon: 'none'
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async ifSendNotifyVeriftMsg() {
    try {
      const subMsgSetting = (await app.mpServerless.db.collection('setting').findOne({ _id: 'subscribeMsg' })).result;
      if (!subMsgSetting) return;
      const triggerNum = subMsgSetting.verifyPhoto?.triggerNum;
      if (!triggerNum) return;
      var numUnchkPhotos = (await app.mpServerless.db.collection('photo').count({
        verified: false
      })).result;

      if (numUnchkPhotos >= triggerNum) {
        await sendNotifyVertifyNotice(numUnchkPhotos);
        console.log("toSendNVMsg");
      }
    } catch (e) {
      console.log('通知检查跳过:', e.message);
    }
  },

  async uploadImg(photo) {
    if (photo.uploaded) {
      console.log("照片已上传，跳过");
      return;
    }

    const cat = this.data.cat;
    const tempFilePath = photo.file.path;

    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);

    let upRes;
    if (isDemoMode()) {
      // Demo 模式：模拟上传延迟
      await new Promise(resolve => setTimeout(resolve, 800));
      upRes = {
        fileUrl: tempFilePath,
        fileId: 'demo-file-' + Date.now(),
      };
      console.log("Demo 上传模拟:", upRes);
    } else {
      upRes = await uploadFile({
        filePath: tempFilePath,
        cloudPath: '/' + cat.campus + '/' + generateUUID() + '.' + ext,
      });
      console.log("上传图片:", upRes);
    }

    const params = {
      cat_id: cat._id,
      photo_id: upRes.fileUrl,
      photo_file_id: upRes.fileId,
      user_id: this.data.user._id,
      verified: false,
      shooting_date: photo.shooting_date,
      photographer: photo.pher
    };

    if (this.data.location) {
      params.latitude = this.data.location.latitude;
      params.longitude = this.data.location.longitude;
    }

    if (isDemoMode()) {
      console.log("Demo 模式 - 模拟保存记录:", params);
      return { ok: true, id: 'demo-record-' + Date.now() };
    }

    let dbAddRes = await api.curdOp({
      operation: "add",
      collection: "photo",
      data: params
    })
    console.log("curdOp(add-photo) result:", dbAddRes);

    return dbAddRes;
  },

  pickDate(e) {
    console.log(e);
    const index = e.currentTarget.dataset.index;
    this.setData({
      ["photos[" + index + "].shooting_date"]: e.detail.value
    });
  },

  inputPher(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      ["photos[" + index + "].pher"]: e.detail.value
    })
  },

  setAllDate(e) {
    const value = e.detail.value;
    var photos = this.data.photos;
    for (var ph of photos) {
      ph.shooting_date = value;
    }
    this.setData({
      "set_all.shooting_date": value,
      photos: photos,
    });
  },

  setAllPher(e) {
    const photographer = e.detail.value;
    var photos = this.data.photos;
    for (var ph of photos) {
      ph.pher = photographer;
    }
    this.setData({
      "set_all.pher": photographer,
      photos: photos,
    });
  },

  removeOne(e) {
    if (this.data.uploading) {
      wx.showToast({
        title: '正在上传中，不能移除',
        icon: 'none'
      });
      return;
    }

    const index = e.currentTarget.dataset.index;
    const photos = this.data.photos;
    const new_photos = photos.filter((ph, ind, arr) => {
      return index != ind;
    });
    this.setData({
      photos: new_photos
    });
  },

  goBackIndex(e) {
    wx.switchTab({
      url: '/pages/genealogy/genealogy',
    });
  },

  getUInfo: function () {
    this.setData({
      showEdit: true
    });
  },

  closeEdit: function () {
    this.setData({
      showEdit: false
    });
  },
})
