// miniprogram/pages/imProcess/imProcess.js
const utils = require('../../../utils.js');
const generateUUID = utils.generateUUID;
const isManager = utils.isManager;


const ctx = wx.createCanvasContext('bigPhoto');
const canvasMax = 2000; // 正方形画布的尺寸px

var global_photo; // 数据库项
var global_fileID_compressed, global_fileID_watermark;

const config = require('../../../config.js');
const text_cfg = config.text;

// 自动搞的数量
var auto_count = 0;
Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    phase: 0,
    phase2str: {
      0: '准备开始',
      1: '获取原图URL',
      2: '已生成压缩图',
      3: '已生成水印图',
      4: '准备上传',
      5: '已上传压缩图',
      6: '已上传水印图',
      7: '已写入数据库'
    },
    images_path: {},
    now: 0, // 当前状态
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function () {
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

  loadProcess() {
    const that = this;
    const db = wx.cloud.database();
    const _ = db.command;
    db.collection('photo').where({ photo_compressed: _.in([undefined, '']), verified: true, photo_id: /^((?!\.heic$).)*$/i }).count().then(res => {
      console.log(res);
      that.setData({
        total: res.total
      }, () => {
        // that.beginProcess();
      });
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
        that.loadProcess();
      } else {
        that.setData({
          tipText: '只有管理员Level-3能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 3)
  },

  clickBegin: function() {
    auto_count = 30;
    this.beginProcess();
  },

  beginProcess: function () {
    const that = this;
    const db = wx.cloud.database();
    const _ = db.command;
    db.collection('photo').where({ photo_compressed: _.in([undefined, '']), verified: true }).get().then(res => {
      console.log(res);
      if(res.data.length) {

        // 自动下一步
        if (auto_count) {
          auto_count--;
          console.log("还剩" + auto_count + "张自动上传");
          that.processOne(res.data[0]);
        } else {
          wx.showModal({
            title: '等待操作',
            content: '继续处理请点击按钮',
            showCancel: false,
          });
        }
        
      } else {
        wx.showModal({
          title: '处理完成',
          content: '没有等待处理的猫图啦',
          showCancel: false,
        });
      }
    });
  },

  // 处理一张图片
  processOne: function (photo) {
    photo.mdate = new Date(photo.mdate).toJSON();
    console.log(photo);
    global_photo = photo;
    const that = this;
    this.setData({phase: 0});
    // 获取原图
    wx.getImageInfo({
      src: photo.photo_id,
      success: res => {
        console.log(res);
        that.setData({
          now: that.data.now + 1,
          phase: 1,
          origin: res
        });
        that.compress();
      }
    });
  },

  // 获取压缩图
  compress: function() {
    const that = this;
    const origin = this.data.origin;
    const draw_rate = Math.max(origin.width, origin.height) / canvasMax;
    const draw_width = origin.width / draw_rate;
    const draw_height = origin.height / draw_rate;

    // 压缩后的大小
    var comp_width, comp_height;
    if (origin.width > origin.height) {
      comp_width = 500;
      comp_height = origin.height/origin.width * 500;
    } else {
      comp_height = 500;
      comp_width = origin.width/origin.height * 500;
    }
    
    ctx.drawImage(origin.path, 0, 0, draw_width, draw_height);
    
    // 写上水印
    const photo = global_photo;
    const userInfo = photo.userInfo;
    ctx.setFontSize(draw_height * 0.03);
    ctx.setFillStyle('white');
    ctx.fillText(text_cfg.app_name + '@' + (photo.photographer || userInfo.nickName), 30, draw_height - (draw_height * 0.03));
    

    ctx.draw(false, function () {
      // 变成图片显示
      wx.canvasToTempFilePath({
        canvasId: 'bigPhoto',
        width: draw_width,
        height: draw_height,
        destWidth: comp_width,
        destHeight: comp_height,
        fileType: 'jpg',
        success: function (res) {
          that.setData({
            phase: 2,
            "images_path.compressed": res.tempFilePath
          }, () => {
            that.watermark();
          });
        }
      }, that);
    });
  },

  // 打水印
  watermark: function () {
    const that = this;
    const origin = this.data.origin;
    const draw_rate = Math.max(origin.width, origin.height) / canvasMax;
    const draw_width = origin.width / draw_rate;
    const draw_height = origin.height / draw_rate;

    const photo = global_photo;
    const userInfo = photo.userInfo;
    // const shooting_date = photo.shooting_date;

    ctx.drawImage(origin.path, 0, 0, draw_width, draw_height);
    // ctx.drawImage(origin.path, 0, 0, draw_width, draw_height);
    // 写上水印
    ctx.setFontSize(draw_height * 0.03);
    ctx.setFillStyle('white');
    ctx.fillText(text_cfg.app_name + '@' + (photo.photographer || userInfo.nickName), 30, draw_height - (draw_height * 0.03));
    ctx.draw(false, function () {
      // 变成图片显示
      wx.canvasToTempFilePath({
        canvasId: 'bigPhoto',
        width: draw_width,
        height: draw_height,
        destWidth: origin.width,
        destHeight: origin.height,
        fileType: 'jpg',
        success: function (res) {
          that.setData({
            phase: 3,
            "images_path.watermark": res.tempFilePath
          }, () => {
            that.uploadCompressed();
          })
        }
      }, that);
    });
  },

  // 上传压缩图
  uploadCompressed: function() {
    wx.showLoading({
      title: '上传中',
      mask: true,
    });
    const that = this;
    const filePath = this.data.images_path.compressed;
    const ext = this.data.origin.type;
    wx.cloud.uploadFile({
      cloudPath: 'compressed/' + generateUUID() + '.' + ext, // 上传至云端的路径
      filePath: filePath,
      success: res => {
        global_fileID_compressed = res.fileID;
        that.setData({
          phase: 5
        }, () => {
          that.uploadWatermark();
        })
      },
      fail: console.error
    })
  },

  // 上传水印图
  uploadWatermark: function () {
    const that = this;
    const filePath = this.data.images_path.watermark;
    const ext = this.data.origin.type;
    wx.cloud.uploadFile({
      cloudPath: 'watermark/' + generateUUID() + '.' + ext, // 上传至云端的路径
      filePath: filePath,
      success: res => {
        global_fileID_watermark = res.fileID;
        that.setData({
          phase: 6
        }, () => {
          that.updataDatabase();
        })
      },
      fail: console.error
    })
  },

  // 更新数据库
  updataDatabase: function() {
    const that = this;
    wx.cloud.callFunction({
      name: 'managePhoto',
      data: {
        photo: global_photo,
        type: 'setProcess',
        compressed: global_fileID_compressed,
        watermark: global_fileID_watermark,
      },
      success: () => {
        that.setData({
          phase: 7,
          origin: {},
          global_photo: '',
          global_fileID_compressed: '',
          global_fileID_watermark: '',
        }, () => {
          wx.hideLoading();
          that.beginProcess();
        });
      }
    })
  },

  preview: function(e) {
    const src = e.currentTarget.dataset.src;
    if(!src) {
      return false;
    }
    wx.previewImage({
      urls: [src],
    });
  }
})