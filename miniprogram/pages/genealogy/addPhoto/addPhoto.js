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
import {
  cloud
} from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

Page({
  /**
   * 页面的初始数据
   */
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
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    const db = await cloud.databaseAsync();
    const cat_id = options.cat_id;
    var catRes = await db.collection('cat').doc(cat_id).field({
      birthday: true,
      name: true,
      campus: true,
      _id: true
    }).get();
    this.setData({
      cat: catRes.data,
      birth_date: catRes.data.birthday || ''
    });
    //this.checkUInfo();

    // 获取一下现在的日期，用在拍摄日前选择上
    const today = new Date();
    var now_date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    this.setData({
      now_date: now_date
    });

    this.setData({
      canUpload: await checkCanUpload()
    });

    // 获取一下手机平台
    const device = await wx.getSystemInfoSync();
    this.setData({
      isIOS: device.platform == 'ios'
    });
  },

  async onShow() {
    await getPageUserInfo(this);
  },

  onUnload: async function (options) {
    await this.ifSendNotifyVeriftMsg()
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const share_text = `来给${this.data.cat.name}添加照片 - ${config.text.app_name}`;
    return shareTo(share_text, path);
  },

  async chooseImg(e) {
    var res = await wx.chooseMedia({
      count: 20,
      mediaType: ['image'],
      sizeType: ["compressed"],
      sourceType: ['album', 'camera'],
    })
    var photos = [];
    for (var file of res.tempFiles) {
      // 需要压缩
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
      console.log("uploading lock.");
      return;
    }
    this.setData({
      uploading: true
    })
    await requestNotice('verify');
    wx.showLoading({
      title: config.text.add_photo.success_tip_title,
      mask: true,
    });
    const currentIndex = e.currentTarget.dataset.index;
    const photo = this.data.photos[currentIndex];
    await this.uploadImg(photo);
    this.data.photos = this.data.photos.filter((ph) => {
      // 把已上传的图片从图片列表中去掉
      return ph.file.path != photo.file.path;
    });
    this.setData({
      uploading: false,
      photos: this.data.photos,
    });
    wx.hideLoading();
    wx.showModal({
      title: config.text.add_photo.success_tip_title,
      content: config.text.add_photo.success_tip_content,
      showCancel: false
    });
  },

  // 点击多个上传
  async uploadAllClick(e) {
    if (this.data.uploading) {
      console.log("uploading lock.");
      return;
    }
    const photos = []; // 这里只会保存可以上传的照片
    for (const item of this.data.photos) {
      if (item.shooting_date && item.file.path) {
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
    await requestNotice('verify');
    for (let i = 0; i < photos.length; ++i) {
      wx.showLoading({
        title: '正在上传(' + (photos.length - i) + ')',
        mask: true,
      });
      await this.uploadImg(photos[i]);
      this.data.photos = this.data.photos.filter((ph) => {
        // 把已上传的图片从图片列表中去掉
        return ph.file.path != photos[i].file.path;
      });
    }
    this.setData({
      uploading: false,
      photos: this.data.photos,
    })
    wx.hideLoading();
    wx.showModal({
      title: config.text.add_photo.success_tip_title,
      content: config.text.add_photo.success_tip_content,
      showCancel: false
    });
  },

  async ifSendNotifyVeriftMsg() {
    const db = await cloud.databaseAsync();
    const subMsgSetting = await db.collection('setting').doc('subscribeMsg').get();
    const triggerNum = subMsgSetting.data.verifyPhoto.triggerNum; //几条未审核才触发
    // console.log("triggerN",triggerNum);
    var numUnchkPhotos = (await db.collection('photo').where({
      verified: false
    }).count()).total;

    if (numUnchkPhotos >= triggerNum) {
      await sendNotifyVertifyNotice(numUnchkPhotos);
      console.log("toSendNVMsg");
    }
  },

  async uploadImg(photo) {
    // multiple 表示当前是否在批量上传，如果是就不显示上传成功的弹框
    this.setData({
      uploading: true,
    });
    const cat = this.data.cat;
    const tempFilePath = photo.file.path;
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);

    let upRes = await cloud.uploadFile({
      cloudPath: cat.campus + '/' + generateUUID() + '.' + ext, // 上传至云端的路径
      filePath: tempFilePath, // 小程序临时文件路径
    });
    // 返回文件 ID
    console.log(upRes.fileID);

    // 添加记录
    const params = {
      cat_id: cat._id,
      photo_id: upRes.fileID,
      user_id: this.data.user._id,
      verified: false,
      shooting_date: photo.shooting_date,
      photographer: photo.pher
    };

    let dbAddRes = (await api.curdOp({
      operation: "add",
      collection: "photo",
      data: params
    })).result;
    console.log("curdOp(add-photo) result:", dbAddRes);
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

  // 下面是统一设置
  setAllDate(e) {
    const value = e.detail.value;
    var photos = this.data.photos;
    console.log(photos);
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

  // 移除其中一个
  removeOne(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.photos;
    const new_photos = photos.filter((ph, ind, arr) => {
      // 这个photo是用户点击的photo，在上面定义的
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

  getUInfo: function() {
    this.setData({
    showEdit: true
    });
  },
  closeEdit: function() {
    this.setData({
    showEdit: false
    });
  },
})