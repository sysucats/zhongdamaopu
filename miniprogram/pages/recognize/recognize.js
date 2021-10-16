// pages/recognize/recognize.js
const utils = require('../../utils.js');
const config = require('../../config.js');

const randomInt = utils.randomInt;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cameraAuth: false,
    devicePosition: 'back', // 前置/后置摄像头
    photoPath: null, // 用户选择的照片的路径
    catList: [], // 展示的猫猫列表
    showResultBox: false, // 用来配合动画延时展示resultBox
  },

  onLoad() {
    this.checkAuth();
  },

  async checkAuth() {
    let setting = await wx.getSetting();
    console.log('auth setting:', setting.authSetting);
    this.setData({
      cameraAuth: setting.authSetting['scope.camera']
    });
  },

  async reqCamAuth() {
    let setting = await wx.getSetting();
    if (setting.authSetting['scope.camera'] === false) {
      // 拒绝过授权，这时无法弹窗唤起授权，只能跳转到设置页面
      await wx.openSetting();
    } else {
      // 未申请过，唤起弹窗授权
      await wx.authorize({
        scope: 'scope.camera'
      });
    }
    this.checkAuth(); // 重新检查授权情况
  },

  takePhoto() {
    if (!this.data.cameraAuth) {
      return;
    }
    const that = this;
    const ctx = wx.createCameraContext();
    ctx.takePhoto({
      quality: 'high',
      success: (res) => {
        that.setData({
          photoPath: res.tempImagePath
        });
        that.recognizePhoto();
      }
    });
  },

  async recognizePhoto() {
    wx.showLoading({
      title: '翻阅猫谱中...',
      mask: true
    });
    // 压缩图片
    const compressPhotoPath = await this.compressPhoto();
    // 调用服务端接口进行识别
    const that = this;
    wx.uploadFile({
      filePath: compressPhotoPath,
      name: 'photo',
      url: config.recognize_url,
      timeout: 10 * 1000, // 10s超时
      success(resp) {
        try {
          if (resp.statusCode != 200) {
            throw resp.data;
          }
          const res = JSON.parse(resp.data); // 这里也可能抛出异常
          if (res.ok === true) {
            that.loadCatsResult(res.data);
          } else {
            throw res;
          }
        } catch (err) {
          console.log('get error from interface:', err);
          wx.hideLoading();
          wx.showToast({
            icon: 'error',
            title: '出错了'
          });
          wx.reportMonitor('recognizeCatPhotoError', 1);
        }
      },
      fail(err) {
        console.log(err);
        wx.hideLoading();
        wx.showToast({
          icon: 'error',
          title: '出错了'
        });
        wx.reportMonitor('recognizeCatPhotoError', 1);
      }
    })
  },

  async compressPhoto() {
    // 获取图像宽高信息
    const photoInfo = await wx.getImageInfo({
      src: this.data.photoPath,
    });
    console.log('photo info:', photoInfo);
    // 使用canvas方法压缩图片
    const canvasSideLen = 500;
    const drawRate = Math.max(photoInfo.width, photoInfo.height) / canvasSideLen; // 计算缩放比
    const drawWidth = photoInfo.width / drawRate;
    const drawHeight = photoInfo.height / drawRate;
    const ctx = wx.createCanvasContext('canvasForCompress');
    ctx.drawImage(photoInfo.path, 0, 0, drawWidth, drawHeight);
    const compressPhotoPath = await new Promise((resolve, reject) => {
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'canvasForCompress',
          width: drawWidth,
          height: drawHeight,
          fileType: 'jpg',
          success(res) {
            resolve(res.tempFilePath);
          },
          fail(err) {
            reject(err);
          }
        });
      });
    });
    return compressPhotoPath;
  },

  async loadCatsResult(catData) {
    let catList = [];
    // 最多maxNum只，最少minNum只，去除概率太低的
    const minProb = 0.001;
    const minNum = 3;
    const maxNum = 5;
    for (let index = 0; index < maxNum; index++) {
      if (catData[index].prob > minProb || index < minNum) {
        let cat = catData[index];
        let catInfo = await this.getCatInfo(cat);
        catList.push(catInfo);
      } else {
        break;
      }
    }
    console.log("cat list:", catList);
    this.setData({
      catList: catList
    });
    wx.hideLoading();
    // 在布局完成上移后展示resultBox
    const that = this;
    setTimeout(() => {
      that.setData({
        showResultBox: true,
      });
    }, 500);
  },

  async getCatInfo(cat) {
    const db = wx.cloud.database();
    const catInfo = (await db.collection('cat').doc(cat.catID).get()).data;
    catInfo.prob = (cat.prob * 100).toFixed(1);
    let photo = await this.getCatPhoto(catInfo);
    catInfo.photo = photo;
    return catInfo;
  },

  async getCatPhoto(catInfo) {
    const db = wx.cloud.database();
    const photo = db.collection('photo');
    // 从精选照片里随机挑选一张
    const query = {
      cat_id: catInfo._id,
      verified: true,
      best: true
    };
    var total = catInfo.photo_count;
    var index = randomInt(0, total);
    var photoURL = (await photo.where(query).skip(index).limit(1).get()).data[0];
    return photoURL;
  },

  choosePhoto() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success(res) {
        that.setData({
          photoPath: res.tempFilePaths[0]
        });
        that.recognizePhoto();
      }
    });
  },

  reset() {
    this.setData({
      photoPath: null,
      catList: [],
      showResultBox: false,
    });
  },

  reverseCamera() {
    if (!this.data.cameraAuth) {
      return;
    }
    if (this.data.devicePosition === 'front') {
      this.setData({
        devicePosition: 'back'
      });
    } else {
      this.setData({
        devicePosition: 'front'
      });
    }
  },

  savePhoto() {
    wx.saveImageToPhotosAlbum({
      filePath: this.data.photoPath,
      success() {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
        });
      }
    })
  },

  tapCatCard(e) {
    const catId = e.currentTarget.dataset.catId;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + catId,
    });
  },

  tapPreview(e) {
    if (!this.data.photoPath) {
      return;
    }
    wx.previewImage({
      urls: [this.data.photoPath],
    });
  },

  onShareAppMessage() {
    return {
      title: '拍照识猫 - 中大猫谱',
      imageUrl: '../../images/recognize/share_cover.jpg'
    };
  }

})