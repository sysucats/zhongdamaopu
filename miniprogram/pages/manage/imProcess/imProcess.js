// miniprogram/pages/imProcess/imProcess.js
import { generateUUID } from "../../../utils/utils";
import { text as text_cfg } from "../../../config";
import { checkAuth, fillUserInfo } from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { uploadFile, signCosUrl } from "../../../utils/common"
import drawUtils from "../../../utils/draw";

const canvasMax = 1200; // 正方形画布的尺寸px
const compressLength = 500; // 压缩图的最长边大小
const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
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
    photoList: [], // 新增：待处理照片列表
    selectedCount: 0, // 新增：选中照片数量
    allSelected: false, // 新增：是否全选
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
  },

  // 修改：加载所有需要处理的照片到列表
  async loadProcess() {
    try {
      wx.showLoading({
        title: '加载中...',
      });
      
      const { result: total } = await app.mpServerless.db.collection('photo').count({
        photo_compressed: { $in: [undefined, ''] },
        verified: true
      });
      
      // 获取所有需要处理的照片
      const { result: photos } = await app.mpServerless.db.collection('photo').find({
        photo_compressed: { $in: [undefined, ''] },
        verified: true
      }, {
        limit: 100 // 限制一次加载100张，避免过多
      });
      
      // 填充用户信息
      await fillUserInfo(photos, "_openid", "userInfo");
      
      // 为每张照片添加选中状态，并生成签名URL和格式化日期
      const photoList = [];
      for (let photo of photos) {
        // 生成签名URL用于显示缩略图
        const signedPhotoId = await signCosUrl(photo.photo_id);
        
        // 格式化日期
        let formattedDate = '未知时间';
        try {
          if (photo.mdate) {
            const date = new Date(photo.mdate);
            formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          }
        } catch (error) {
          console.error('日期格式化错误:', error);
        }
        
        photoList.push({
          ...photo,
          checked: false,
          signedPhotoId: signedPhotoId, // 签名后的URL用于显示缩略图
          formattedDate: formattedDate // 格式化后的日期
        });
      }
      
      console.log("imProcess loadProcess:", total, photoList);
      this.setData({
        total: total,
        now: 0,
        processing: false,
        photoList: photoList,
        selectedCount: 0,
        allSelected: false
      });
      
      wx.hideLoading();
    } catch (error) {
      console.error('加载照片列表失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  // 修改：点击处理按钮
  clickProcessBtn: async function (e) {
    const { test } = e.currentTarget.dataset;
    
    // 如果没有选中照片，提示用户
    if (this.data.selectedCount === 0 && !test) {
      wx.showToast({
        title: '请先选择照片',
        icon: 'none'
      });
      return;
    }
    
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
    
    // 停止处理
    wx.showLoading({
      title: '等待完成当前...',
      mask: true
    });
  },

  // 修改：开始处理选中的照片
  beginProcess: async function (isTesting) {
    // 获取选中的照片
    const selectedPhotos = this.data.photoList.filter(photo => photo.checked);
    
    // 测试模式使用第一张照片
    const photosToProcess = isTesting ? this.data.photoList.slice(0, 1) : selectedPhotos;
    
    if (photosToProcess.length === 0) {
      wx.showModal({
        title: '提示',
        content: '没有选中需要处理的照片',
        showCancel: false,
      });
      this.setData({
        processing: false
      });
      return;
    }
    
    // 初始化canvas
    const initCanvas = await drawUtils.initCanvas('#bigPhoto');
    this.jsData.gCtx = initCanvas.ctx;
    this.jsData.gCanvas = initCanvas.canvas;
    
    // 处理每张照片
    for (let i = 0; i < photosToProcess.length; i++) {
      if (!this.data.processing) break; // 如果用户点击停止，则中断
      
      const photo = photosToProcess[i];
      await this.processOne(photo, isTesting);
      
      // 更新进度
      this.setData({
        now: this.data.now + 1
      });
    }
    
    this.setData({
      processing: false
    });
    
    // 重新加载照片列表
    await this.loadProcess();
    wx.hideLoading();
  },

  setPhase: function (phase) {
    this.setData({ phase: phase });
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
        src: await signCosUrl(photoInfo.photo_id),
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
      return;
    }
    
    // 上传压缩图
    this.setPhase(4);
    const compressCloudPath = `/compressed/${generateUUID()}.jpg`;
    const compressCloudID = await this.uploadImage(compressPath, compressCloudPath);
    console.log("compressCloudID", compressCloudID);
    
    // 上传水印图
    this.setPhase(5);
    const watermarkCloudPath = `/watermark/${generateUUID()}.jpg`;
    const watermarkCloud = await this.uploadImage(watermarkPath, watermarkCloudPath);
    console.log("watermarkCloud", watermarkCloud);
    
    // 更新数据库
    this.setPhase(6);
    await this.updataDatabase(photoInfo, compressCloudID, watermarkCloud);
    
    // 结束
    this.setPhase(0);
  },

  // 获取压缩图
  compress: async function (oriPhotoObj) {
    const origin = oriPhotoObj;

    const draw_rate = Math.max(origin.width, origin.height) / canvasMax;
    console.log(origin, draw_rate);
    const draw_width = Math.floor(origin.width / draw_rate);
    const draw_height = Math.floor(origin.height / draw_rate);
    console.log("draw size", draw_width, draw_height);

    // 画上图片
    const { gCtx, gCanvas } = this.jsData;
    await drawUtils.drawImage(gCtx, gCanvas, origin.path, 0, 0, draw_width, draw_height);

    // 压缩后的大小
    var comp_width, comp_height;
    if (origin.width > origin.height) {
      comp_width = compressLength;
      comp_height = Math.floor(origin.height / origin.width * compressLength);
    } else {
      comp_height = compressLength;
      comp_width = Math.floor(origin.width / origin.height * compressLength);
    }

    console.log("comp size", comp_width, comp_height);

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
    const res = await uploadFile({
      filePath: filePath,
      cloudPath: cloudPath,
    })
    return res;
  },

  // 更新数据库
  updataDatabase: async function (oriPhoto, compressFile, watermarkCloud) {
    await api.managePhoto({
      photo: oriPhoto,
      type: 'setProcess',
      compressed: compressFile.fileUrl,
      compressedId: compressFile.fileId,
      watermark: watermarkCloud.fileUrl,
      watermarkId: watermarkCloud.fileId,
    })
  },

  // 新增：全选/取消全选
  toggleSelectAll: function() {
    const allSelected = !this.data.allSelected;
    const photoList = this.data.photoList.map(photo => {
      return {
        ...photo,
        checked: allSelected
      };
    });
    
    this.setData({
      photoList: photoList,
      allSelected: allSelected,
      selectedCount: allSelected ? photoList.length : 0
    });
  },

  // 新增：切换单张照片的选中状态
  togglePhotoSelect: function(e) {
    const index = e.currentTarget.dataset.index;
    const photoList = this.data.photoList;
    photoList[index].checked = !photoList[index].checked;
    
    const selectedCount = photoList.filter(photo => photo.checked).length;
    const allSelected = selectedCount === photoList.length;
    
    this.setData({
      photoList: photoList,
      selectedCount: selectedCount,
      allSelected: allSelected
    });
  },

  // 新增：预览照片
  previewPhoto: function(e) {
    const index = e.currentTarget.dataset.index;
    const photo = this.data.photoList[index];

    if (!photo.showImg) {
      this.setData({
        [`photoList[${index}].showImg`]: true,
      });
      return;
    }

    wx.previewImage({
      urls: [photo.signedPhotoId]
    });
  },

  // 修改：删除单张照片后重新加载列表
  deletePhoto: async function(e) {
    const index = e.currentTarget.dataset.index;
    const photo = this.data.photoList[index];
    
    const res = await wx.showModal({
      title: '确认删除',
      content: '确定要删除这张照片吗？此操作不可撤销。',
    });
    
    if (res.confirm) {
      try {
        wx.showLoading({
          title: '删除中...',
        });
        
        // 从数据库删除照片
        await api.managePhoto({
          photo: photo,
          type: 'delete'
        });
        
        wx.showToast({
          title: '删除成功',
        });
        
        // 重新加载照片列表
        await this.loadProcess();
      } catch (error) {
        console.error('删除照片失败:', error);
        wx.hideLoading();
        wx.showToast({
          title: '删除失败',
          icon: 'error'
        });
      }
    }
  },

  // 修改：处理单张照片后重新加载列表
  processSinglePhoto: async function(e) {
    const index = e.currentTarget.dataset.index;
    const photo = this.data.photoList[index];
    
    this.setData({
      processing: true
    });
    
    try {
      // 初始化canvas
      const initCanvas = await drawUtils.initCanvas('#bigPhoto');
      this.jsData.gCtx = initCanvas.ctx;
      this.jsData.gCanvas = initCanvas.canvas;
      
      await this.processOne(photo, false);
      
      wx.showToast({
        title: '处理完成',
      });
      
      // 重新加载照片列表
      await this.loadProcess();
    } catch (error) {
      console.error('处理照片失败:', error);
      this.setData({
        processing: false
      });
      wx.showToast({
        title: '处理失败',
        icon: 'error'
      });
    }
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
    const { text } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: text,
    });
  }
})