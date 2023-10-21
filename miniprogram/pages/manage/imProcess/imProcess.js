// miniprogram/pages/imProcess/imProcess.js
import { generateUUID } from "../../../utils/utils";
import { text as text_cfg } from "../../../config";
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

import drawUtils from "../../../utils/draw";
import lockUtils from "./lock";

const canvasMax = 1200; // 正方形画布的尺寸px
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
    errMsg: "",
  },

  jsData: {},

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function () {
    if (await checkAuth(this, 99)) {
      await this.loadProcess();
    } else {
      wx.navigateBack({
        delta: 1
      });
    }

    this.setData({
      gLockKey: await lockUtils.geneKey("device"),
    });
    await this.getLock();
  },

  async getLock() {
    const scene = "imProcess";
    const key = this.data.gLockKey;
    const limit = 1;
    const expire_minutes = 5;
    const res = await lockUtils.lock(scene, key, limit, expire_minutes);
    const allLocks = await lockUtils.getLockList(scene);
    this.setData({
      gLocking: res,
      allLocks: allLocks,
    });
    if (!res) {
      wx.showToast({
        title: '其他人还在操作...',
        icon: "loading"
      });
      return false;
    }
    return true;
  },

  async releaseLock() {
    const scene = "imProcess";
    const key = this.data.gLockKey;
    await lockUtils.unlock(scene, key);
    this.setData({
      gLocking: false
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

  onUnload: async function () {
    console.log('取消屏幕常亮');
    wx.setKeepScreenOn({
      keepScreenOn: false
    });
    // 释放一下key
    await this.releaseLock();
  },

  async loadProcess() {
    const db = await cloud.databaseAsync();
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
      processing: false,
    });
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  clickProcessBtn: async function (e) {
    const {test} = e.currentTarget.dataset;
    this.data.processing = !this.data.processing;
    this.setData({
      processing: this.data.processing
    });
    // 开始处理
    if (this.data.processing) {
      try {
        this.setData({
          errMsg: "",
        })
        await this.beginProcess(test);  
      } catch (error) {
        console.error(error);
        await wx.showModal({
          title: '出错了',
          content: error.toString(),
          showCancel: false
        });
        this.setData({
          errMsg: JSON.stringify(error.message) || "-",
          errStack: error.stack?.toString() || "-",
        });
        await this.loadProcess();
        wx.hideLoading();
      }

      return;
    }
    // 停止处理，考虑放个mask
    wx.showLoading({
      title: '等待完成当前...',
      mask: true
    });
  },

  beginProcess: async function (isTesting) {
    const db = await cloud.databaseAsync();
    const _ = db.command;
    while (this.data.processing && (await this.getLock())) {
      var photos = (await db.collection('photo').where({
        photo_compressed: _.in([undefined, '']),
        verified: true
      }).limit(1).get()).data;
      
      await fillUserInfo(photos, "_openid", "userInfo");
      console.log("imProcess beginProcess", photos);

      if (!photos.length) {
        wx.showModal({
          title: '等待操作',
          content: '继续处理请点击按钮',
          showCancel: false,
        });
        break;
      }
      // 开始处理一张图
      // 强行重置一下canvas
      const initCanvas = await drawUtils.initCanvas('#bigPhoto');
      this.jsData.gCtx = initCanvas.ctx;
      this.jsData.gCanvas = initCanvas.canvas;
      await this.processOne(photos[0], isTesting);
      this.setData({
        now: this.data.now + 1
      });
    }
    this.setData({
      processing: false
    });
    wx.hideLoading();
  },

  setPhase: function(phase) {
    this.setData({phase: phase});
  },

  // 处理一张图片
  processOne: async function (photoInfo, isTesting) {
    photoInfo.mdate = new Date(photoInfo.mdate).toJSON();
    // 获取原图
    this.setPhase(1);
    if (photoInfo.userInfo === undefined) {
      photoInfo.userInfo = { nickName: '猫友' }
    }
    try {
      var photoObj = await wx.getImageInfo({
        src: photoInfo.photo_id,
      });
    } catch (error) {
      console.error(error);
      const err = new Error(`error: ${JSON.stringify(error)}, photoInfo: ${JSON.stringify(photoInfo)}`);
      err.name = "下载图片失败";
      throw err;
    }
    // 处理旋转问题
    if (photoObj.orientation == 'right' || photoObj.orientation == 'left') {
      [photoObj.width, photoObj.height] = [photoObj.height, photoObj.width];
    }
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
    // 是否只是测试运行
    if (isTesting) {
      await wx.showModal({
        title: '试运行完成',
        content: '请点击缩略图和水印图，查看是否正常',
        showCancel: false,
      })
      await this.loadProcess();
      return;
    }
    // 上传压缩图
    this.setPhase(4);
    const compressCloudPath = `compressed/${generateUUID()}.jpg`;
    const compressCloudID = await this.uploadImage(compressPath, compressCloudPath);
    console.log("compressCloudID", compressCloudID);
    // 上传水印图
    this.setPhase(5);
    const watermarkCloudPath = `watermark/${generateUUID()}.jpg`;
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
    console.log(origin, draw_rate);
    const draw_width = origin.width / draw_rate;
    const draw_height = origin.height / draw_rate;
    console.log("draw size", draw_width, draw_height);

    // 画上图片
    const { gCtx, gCanvas } = this.jsData;
    await drawUtils.drawImage(gCtx, gCanvas, origin.path, 0, 0, draw_width, draw_height);

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
    var path = await drawUtils.getTempPath(gCtx, gCanvas, {
      width: draw_width,
      height: draw_height,
      destWidth: comp_width,
      destHeight: comp_height,
      fileType: "jpg",
    });

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
    const { gCtx, gCanvas } = this.jsData;
    const text = `${text_cfg.app_name}@${photoInfo.photographer || photoInfo.userInfo.nickName}`
    await drawUtils.writeWatermake(gCtx, gCanvas, {
      fontSize: draw_height * 0.03,
      fillStyle: "white",
      text: text,
      x: 30,
      y: draw_height - (draw_height * 0.03)
    });

    // 变成图片显示
    var path = await drawUtils.getTempPath(gCtx, gCanvas, {
      width: draw_width,
      height: draw_height,
      destWidth: origin.width,
      destHeight: origin.height,
      fileType: "jpg",
    });

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
    await api.managePhoto({
      photo: oriPhoto,
      type: 'setProcess',
      compressed: compressFileID,
      watermark: watermarkCloudID,
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
  },

  copyText: function (e) {
    const {text} = e.currentTarget.dataset;
    wx.setClipboardData({
      data: text,
    });
  }
})