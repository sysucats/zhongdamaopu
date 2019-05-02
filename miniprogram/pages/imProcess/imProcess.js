// miniprogram/pages/imProcess/imProcess.js
import { regeneratorRuntime, generateUUID } from '../../utils.js';
const ctx = wx.createCanvasContext('bigPhoto');
const canvasMax = 2000; // 正方形画布的尺寸px

var global_photo; // 数据库项
var global_fileID_compressed, global_fileID_watermark;

// 自动搞的数量
var auto_count = 40;
Page({

  /**
   * 页面的初始数据
   */
  data: {
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
    now: 0,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function () {
    const that = this;
    const db = wx.cloud.database();
    const _ = db.command;
    db.collection('photo').where({ photo_compressed: _.in([undefined, '']), verified: true }).count().then(res => {
      console.log(res);
      that.setData({
        total: res.total
      }, () => {
        that.beginProcess();
      });
    });
    auto_count = 40;
  },

  beginProcess: function () {
    const that = this;
    const db = wx.cloud.database();
    const _ = db.command;
    db.collection('photo').where({ photo_compressed: _.in([undefined, '']), verified: true }).get().then(res => {
      console.log(res);
      if(res.data.length) {
        that.processOne(res.data[0]);
      } else {
        wx.showModal({
          title: '处理完成',
          content: '没有等待处理的猫图啦',
        });
      }
    });
  },

  // 处理一张图片试试
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
    const shooting_date = photo.shooting_date;

    ctx.drawImage(origin.path, 0, 0, draw_width, draw_height);
    ctx.drawImage(origin.path, 0, 0, draw_width, draw_height);
    // 写上水印
    ctx.setFontSize(draw_height * 0.03);
    ctx.setFillStyle('white');
    ctx.fillText('中大猫谱@' + (photo.photographer || userInfo.nickName), 30, draw_height - (draw_height * 0.03));
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
            // 自动下一步
            if (auto_count) {
              auto_count --;
              console.log("还剩" + auto_count + "张自动上传");
              setTimeout(() => that.uploadCompressed(), 1000);
            }
          })
        }
      }, that);
    });
  },

  // 上传压缩图
  uploadCompressed: function() {
    wx.showLoading({
      title: '上传中',
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