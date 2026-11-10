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
import { loadFilter } from "../../../utils/page";

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
    campusCenters: {},  // 校区中心坐标字典
    // 地图选点
    mapPickerVisible: false,
    mapPickerConfirming: false,
    pageMetaStyle: '',
    mapPickerInitLat: 23.1026,
    mapPickerInitLng: 113.2996,
    mapPickerLat: 23.1026,
    mapPickerLng: 113.2996,
    mapPickerScale: 14,
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

      // 加载校区中心坐标（用于地图选点默认定位）
      try {
        var filterRes = await loadFilter({ nocache: true });
        if (filterRes.campusCenters) {
          this.setData({ campusCenters: filterRes.campusCenters });
        }
      } catch (e) {
        console.log('加载校区中心坐标失败:', e.message);
      }
    }

    const today = new Date();
    var now_date = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
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

  // ==================== 地图选点（内嵌 map 组件） ====================

  // 自动定位只提供选点起点，确认前不修改照片位置。
  autoLocate() {
    wx.showLoading({ title: '定位中...' });
    wx.getFuzzyLocation({
      type: 'gcj02',
      success: res => {
        wx.hideLoading();
        this.showMapPicker({ latitude: res.latitude, longitude: res.longitude });
      },
      fail: err => {
        wx.hideLoading();
        console.log('[autoLocate] - 定位失败:', err);
        wx.showModal({
          title: '定位失败',
          content: '暂时无法获取当前位置，请使用「选择拍摄位置」在地图上选点。',
          showCancel: false,
        });
      },
    });
  },

  openMapPicker() {
    this.showMapPicker(this.data.location);
  },

  showMapPicker(location) {
    const campus = this.data.cat && this.data.cat.campus;
    const campusCenter = this.data.campusCenters[campus];
    const center = location || campusCenter || config.map_center;
    const scale = campusCenter ? (campusCenter.scale || 14) : 14;
    this._mapPickerSession = (this._mapPickerSession || 0) + 1;
    this.setData({
      mapPickerVisible: true,
      mapPickerConfirming: false,
      pageMetaStyle: 'overflow: hidden;',
      mapPickerInitLat: center.latitude,
      mapPickerInitLng: center.longitude,
      mapPickerLat: center.latitude,
      mapPickerLng: center.longitude,
      mapPickerScale: scale,
    });
  },

  // 手势结束后同步中心和级别；忽略自身更新引发的事件，避免回写循环。
  onMapRegionChange(e) {
    if (e.type !== 'end' || e.causedBy === 'update') return;
    const { centerLocation, scale } = e.detail || {};
    const session = this._mapPickerSession;
    const update = patch => {
      if (this.data.mapPickerVisible && this._mapPickerSession === session) this.setData(patch);
    };
    const mapCtx = wx.createMapContext('photoMapPicker');
    if (centerLocation) {
      update({ mapPickerLat: centerLocation.latitude, mapPickerLng: centerLocation.longitude });
    } else {
      mapCtx.getCenterLocation({
        success: res => update({ mapPickerLat: res.latitude, mapPickerLng: res.longitude }),
      });
    }
    if (scale !== undefined) {
      update({ mapPickerScale: scale });
    } else {
      mapCtx.getScale({ success: res => update({ mapPickerScale: res.scale }) });
    }
  },

  async confirmMapPicker() {
    if (!this.data.mapPickerVisible || this.data.mapPickerConfirming) return;
    const session = this._mapPickerSession;
    this.setData({ mapPickerConfirming: true });
    try {
      const center = await new Promise((resolve, reject) => {
        wx.createMapContext('photoMapPicker').getCenterLocation({ success: resolve, fail: reject });
      });
      if (!this.data.mapPickerVisible || this._mapPickerSession !== session) return;
      this.setData({
        location: { latitude: center.latitude, longitude: center.longitude },
        mapPickerVisible: false,
        pageMetaStyle: '',
      });
      wx.showToast({ title: '已选择位置', icon: 'success' });
    } catch (err) {
      if (this.data.mapPickerVisible && this._mapPickerSession === session) {
        wx.showToast({ title: '无法读取地图位置，请重试', icon: 'none' });
      }
    } finally {
      if (this._mapPickerSession === session) this.setData({ mapPickerConfirming: false });
    }
  },

  cancelMapPicker() {
    this.setData({ mapPickerVisible: false, mapPickerConfirming: false, pageMetaStyle: '' });
  },

  zoomMapIn() {
    const scale = Math.min(20, this.data.mapPickerScale + 1);
    this.setData({ mapPickerScale: scale });
  },

  zoomMapOut() {
    const scale = Math.max(3, this.data.mapPickerScale - 1);
    this.setData({ mapPickerScale: scale });
  },

  clearLocation() {
    this.setData({ location: null });
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
        file: file,
        shooting_date: this.data.set_all.shooting_date,
        pher: this.data.set_all.pher,
      });
    }
    this.setData({
      photos: this.data.photos.concat(photos),
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
