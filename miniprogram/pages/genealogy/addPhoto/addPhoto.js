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

const app = getApp();

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
    const cat_id = options.cat_id;
    var catRes = (await app.mpServerless.db.collection('cat').findOne({ _id: cat_id }, { projection: { birthday: 1, name: 1, campus: 1 } })).result;
    this.setData({
      cat: catRes,
      birth_date: catRes.birthday || ''
    });

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
    // 如果正在上传，不允许选择新图片
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
      wx.showToast({
        title: '正在上传中，请稍后',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      uploading: true
    });
    
    try {
      await requestNotice('verify');
      wx.showLoading({
        title: config.text.add_photo.success_tip_title,
        mask: true,
      });
      
      const currentIndex = e.currentTarget.dataset.index;
      const photo = this.data.photos[currentIndex];
      
      // 检查照片是否已经上传过（防止重复点击）
      if (photo.uploaded) {
        console.log("照片已上传，跳过");
        return;
      }
      
      await this.uploadImg(photo);
      
      // 标记为已上传
      photo.uploaded = true;
      
      // 过滤掉已上传的照片
      this.data.photos = this.data.photos.filter((ph) => {
        return !ph.uploaded;
      });
      
      this.setData({
        photos: this.data.photos,
      });
      
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
      this.setData({
        uploading: false
      });
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
    
    const photos = []; // 这里只会保存可以上传的照片
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
    
    this.setData({
      uploading: true
    });
    
    try {
      await requestNotice('verify');
      
      // 使用 Promise 链确保顺序执行，避免并发问题
      for (let i = 0; i < photos.length; ++i) {
        if (photos[i].uploaded) {
          continue; // 跳过已上传的
        }
        
        wx.showLoading({
          title: '正在上传(' + (i + 1) + '/' + photos.length + ')',
          mask: true,
        });
        
        await this.uploadImg(photos[i]);
        
        // 标记为已上传
        photos[i].uploaded = true;
      }
      
      // 过滤掉已上传的照片
      this.data.photos = this.data.photos.filter((ph) => {
        return !ph.uploaded;
      });
      
      this.setData({
        photos: this.data.photos,
      });
      
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
      this.setData({
        uploading: false
      });
    }
  },

  async ifSendNotifyVeriftMsg() {
    const subMsgSetting = (await app.mpServerless.db.collection('setting').findOne({ _id: 'subscribeMsg' })).result;
    const triggerNum = subMsgSetting.verifyPhoto.triggerNum; //几条未审核才触发
    var numUnchkPhotos = (await app.mpServerless.db.collection('photo').count({
      verified: false
    })).result;

    if (numUnchkPhotos >= triggerNum) {
      await sendNotifyVertifyNotice(numUnchkPhotos);
      console.log("toSendNVMsg");
    }
  },

  async uploadImg(photo) {
    // 再次检查是否已上传，防止重复
    if (photo.uploaded) {
      console.log("照片已上传，跳过");
      return;
    }
    
    const cat = this.data.cat;
    const tempFilePath = photo.file.path;
    
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);

    let upRes = await uploadFile({
      filePath: tempFilePath,
      cloudPath: '/' + cat.campus + '/' + generateUUID() + '.' + ext,
    })
    console.log("上传图片:", upRes);

    // 添加记录
    const params = {
      cat_id: cat._id,
      photo_id: upRes.fileUrl,
      photo_file_id: upRes.fileId,
      user_id: this.data.user._id,
      verified: false,
      shooting_date: photo.shooting_date,
      photographer: photo.pher
    };

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