// miniprogram/pages/imProcess/imProcess.js
const utils = require('../../../utils.js');
const generateUUID = utils.generateUUID;
const isManager = utils.isManager;

const config = require("../../../config.js");
const cloud = require('../../../cloudAccess.js').cloud;

const drawUtils = require("./draw.js");


const text_cfg = config.text;

const canvasMax = 2000; // 正方形画布的尺寸px
const compressLength = 500; // 压缩图的最长边大小


Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    phase: 0,
    phase2str: [
      '未开始',
      '获取原图',
      '生成压缩图',
      '生成水印图',
      '上传压缩图',
      '上传水印图',
      '写入数据库'
    ],
    images_path: {},
    now: 0, // 当前状态
    processing: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function () {
    this.checkAuth();
    // this.tipAutoProcess();
  },

  tipAutoProcess: function () {
    const that = this;
    wx.showModal({
      title: '提示',
      content: '目前后台已实现自动处理图片，在该功能正常的情况下管理员无需再手动处理图片。',
      showCancel: true,
      cancelText: '坚持处理',
      cancelColor: '#cd0000',
      confirmText: '离开',
      confirmColor: '#32cd32',
      success: (res) => {
        if (res.cancel) {
          that.checkAuth();
        } else {
          wx.navigateBack({
            delta: 1
          });
        }
      },
      fail: (err) => {
        console.log(err);
      }
    });
  },

  onShow: function () {
    console.log('设置屏幕常亮');
    wx.setKeepScreenOn({
      keepScreenOn: true
    });
  },

  onHide: function () {
    console.log('取消屏幕常亮');
    wx.setKeepScreenOn({
      keepScreenOn: false
    });
  },

  onUnload: function () {
    console.log('取消屏幕常亮');
    wx.setKeepScreenOn({
      keepScreenOn: false
    });
  },

  async loadProcess() {
    const db = cloud.database();
    const _ = db.command;
    const total = (await db.collection('photo').where({
      photo_compressed: _.in([undefined, '']),
      verified: true,
      photo_id: /^((?!\.heic$).)*$/i
    }).count()).total;
    console.log("imProcess loadProcess:", total);
    this.setData({
      total: total,
      now: 0,
    });
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },
  // 检查权限
  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.loadProcess().then();
      } else {
        that.setData({
          tipText: '只有管理员Level-3能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 3)
  },

  clickProcessBtn: async function () {
    this.data.processing = !this.data.processing;
    this.setData({
      processing: this.data.processing
    });
    // 开始处理
    if (this.data.processing) {
      drawUtils.initCanvas();
      await this.beginProcess();
      return;
    }
    // 停止处理，考虑放个mask
    wx.showLoading({
      title: '等待完成当前...',
    });
  },

  beginProcess: async function () {
    const db = cloud.database();
    const _ = db.command;
    while (this.data.processing) {
      const photos = (await db.collection('photo').where({
        photo_compressed: _.in([undefined, '']),
        verified: true
      }).limit(1).get()).data;
      console.log("imProcess beginProcess", photos);

      if (!photos.length) {
        wx.showModal({
          title: '处理完成',
          content: '没有等待处理的猫图啦',
          showCancel: false,
        });
        this.setData({
          processing: false
        });
        break;
      }
      // 开始处理一张图
      await this.processOne(photos[0]);
      this.setData({
        now: this.data.now + 1
      });
      wx.hideLoading();
    }
  },

  setPhase: function(phase) {
    this.setData({phase: phase});
  },

  // 处理一张图片
  processOne: async function (photoInfo) {
    photoInfo.mdate = new Date(photoInfo.mdate).toJSON();
    // 获取原图
    this.setPhase(1);
    var photoObj = await wx.getImageInfo({
      src: photoInfo.photo_id,
    });
    console.log("imProcess processOne:", photoObj);
    this.setData({
      origin: photoObj
    });
    // 压缩图
    this.setPhase(2);
    const compressPath = await this.compress(photoObj);
    console.log("compressPath", compressPath);
    // 水印图
    this.setPhase(3);
    const watermarkPath = await this.watermark(photoObj, photoInfo);
    console.log("watermarkPath", watermarkPath);
    // 上传压缩图
    const ext = photoObj.type;
    this.setPhase(4);
    const compressCloudPath = `compressed/${generateUUID()}.${ext}`;
    const compressCloudID = await this.uploadImage(compressPath, compressCloudPath);
    console.log("compressCloudID", compressCloudID);
    // 上传水印图
    this.setPhase(5);
    const watermarkCloudPath = `watermark/${generateUUID()}.${ext}`;
    const watermarkCloudID = await this.uploadImage(watermarkPath, watermarkCloudPath);
    console.log("watermarkCloudID", watermarkCloudID);
    // 更新数据库
    this.setPhase(6);
    await this.updataDatabase(photoInfo, compressCloudID, watermarkCloudID);
    // 结束
    this.setPhase(0);
  },

  // 获取压缩图
  compress: async function (oriPhotoObj) {
    const origin = oriPhotoObj;

    const draw_rate = Math.max(origin.width, origin.height) / canvasMax;
    const draw_width = origin.width / draw_rate;
    const draw_height = origin.height / draw_rate;
    console.log("draw size", draw_width, draw_height);

    // 画上图片
    await drawUtils.drawImage(origin.path, 0, 0, draw_width, draw_height);

    // 压缩后的大小
    var comp_width, comp_height;
    if (origin.width > origin.height) {
      comp_width = compressLength;
      comp_height = origin.height / origin.width * compressLength;
    } else {
      comp_height = compressLength;
      comp_width = origin.width / origin.height * compressLength;
    }

    // 变成图片显示
    var path = (await drawUtils.getTempPath({
      width: draw_width,
      height: draw_height,
      destWidth: comp_width,
      destHeight: comp_height,
      fileType: origin.type,
    })).tempFilePath;

    this.setData({
      "images_path.compressed": path
    });

    return path;
  },

  // 打水印
  watermark: async function (oriPhotoObj, photoInfo) {
    const origin = oriPhotoObj;

    const draw_rate = Math.max(origin.width, origin.height) / canvasMax;
    const draw_width = origin.width / draw_rate;
    const draw_height = origin.height / draw_rate;

    // 写上水印
    const text = `${text_cfg.app_name}@${photoInfo.photographer || photoInfo.userInfo.nickName}`
    await drawUtils.writeWatermake({
      fontSize: draw_height * 0.03,
      fillStyle: "white",
      text: text,
      x: 30,
      y: draw_height - (draw_height * 0.03)
    });

    // 变成图片显示
    var path = (await drawUtils.getTempPath({
      width: draw_width,
      height: draw_height,
      destWidth: origin.width,
      destHeight: origin.height,
      fileType: origin.type,
    })).tempFilePath;

    this.setData({
      "images_path.watermark": path
    });

    return path;
  },

  // 上传图片
  uploadImage: async function (filePath, cloudPath) {
    const res = (await cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
    }));
    return res.fileID;
  },

  // 更新数据库
  updataDatabase: async function (oriPhoto, compressFileID, watermarkCloudID) {
    await cloud.callFunction({
      name: 'managePhoto',
      data: {
        photo: oriPhoto,
        type: 'setProcess',
        compressed: compressFileID,
        watermark: watermarkCloudID,
      }
    })
  },

  preview: function (e) {
    const src = e.currentTarget.dataset.src;
    if (!src) {
      return false;
    }
    wx.previewImage({
      urls: [src],
    });
  }
})