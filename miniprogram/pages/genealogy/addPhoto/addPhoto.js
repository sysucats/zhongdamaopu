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
    pageMetaStyle: '',
    mapPickerInitLat: 23.1026,
    mapPickerInitLng: 113.2996,
    mapPickerLat: 23.1026,
    mapPickerLng: 113.2996,
    mapPickerInitScale: 14,
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

  openMapPicker() {
    var lat, lng, scale;
    // 已选过位置，地图中心定位到已选坐标
    if (this.data.location) {
      lat = this.data.location.latitude;
      lng = this.data.location.longitude;
    }
    // scale 统一从校区中心或 config 读取（不记录在 location 中）
    var campus = this.data.cat && this.data.cat.campus;
    var centers = this.data.campusCenters;
    if (campus && centers && centers[campus]) {
      var c = centers[campus];
      if (!lat) { lat = c.latitude; lng = c.longitude; }
      scale = c.scale || 14;
    } else {
      if (!lat) {
        lat = config.map_center.latitude;
        lng = config.map_center.longitude;
      }
      scale = 14;
    }
    this.setData({
      mapPickerVisible: true,
      pageMetaStyle: 'overflow: hidden;',
      mapPickerInitLat: lat,
      mapPickerInitLng: lng,
      mapPickerInitScale: scale,
      mapPickerLat: lat,
      mapPickerLng: lng,
      mapPickerScale: scale,
    });
  },

  onMapRegionChange(e) {
    if (e.type === 'end') {
      if (e.detail && e.detail.centerLocation) {
        var lat = e.detail.centerLocation.latitude;
        var lng = e.detail.centerLocation.longitude;
        this.setData({
          mapPickerLat: lat,
          mapPickerLng: lng,
        });
      } else {
        var that = this;
        var mapCtx = wx.createMapContext('photoMapPicker');
        mapCtx.getCenterLocation({
          success: function (res) {
            that.setData({
              mapPickerLat: res.latitude,
              mapPickerLng: res.longitude,
            });
          }
        });
        mapCtx.getScale({
          success: function (res) {
            that.setData({ mapPickerScale: res.scale });
          }
        });
      }
    }
  },

  confirmMapPicker() {
    this.setData({
      location: {
        latitude: this.data.mapPickerLat,
        longitude: this.data.mapPickerLng,
      },
      mapPickerVisible: false,
      pageMetaStyle: '',
    });
    wx.showToast({ title: '已选择位置', icon: 'success' });
  },

  cancelMapPicker() {
    this.setData({ mapPickerVisible: false, pageMetaStyle: '' });
  },

  zoomMapIn() {
    var s = this.data.mapPickerInitScale;
    if (s < 18) {
      var ns = s + 1;
      this.setData({
        mapPickerInitLat: this.data.mapPickerLat,
        mapPickerInitLng: this.data.mapPickerLng,
        mapPickerInitScale: ns,
        mapPickerScale: ns,
      });
    }
  },

  zoomMapOut() {
    var s = this.data.mapPickerInitScale;
    if (s > 3) {
      var ns = s - 1;
      this.setData({
        mapPickerInitLat: this.data.mapPickerLat,
        mapPickerInitLng: this.data.mapPickerLng,
        mapPickerInitScale: ns,
        mapPickerScale: ns,
      });
    }
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
