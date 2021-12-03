// pages/recognize/recognize.js
const utils = require('../../utils.js');
const sha256 = utils.sha256;
const getGlobalSettings = utils.getGlobalSettings;
const randomInt = utils.randomInt;

// 接口设置，onLoad中从数据库拉取。
var interfaceURL;
var secretKey;

// 图片长宽比，在compresPhoto函数中记录。用于重新映射后端返回的catBox位置信息。
var widthHeightRatio;

// 在页面中定义插屏广告
let interstitialAd = null

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cameraAuth: false,
    devicePosition: 'back', // 前置/后置摄像头
    photoPath: null, // 用户选择的照片的路径
    photoBase64: null, // 用户选择的照片的base64编码，用于设置background-image
    catList: [], // 展示的猫猫列表
    catBoxList: [], // 展示的猫猫框列表
    showResultBox: false, // 用来配合动画延时展示resultBox
    showAdBox: true, // 展示banner广告
  },

  onLoad() {
    // 在页面onLoad回调事件中创建插屏广告实例
    if (wx.createInterstitialAd) {
      interstitialAd = wx.createInterstitialAd({
        adUnitId: 'adunit-531fedfc9dcd52c3'
      })
      interstitialAd.onLoad(() => {
        console.log("加载插屏广告成功");
      })
      interstitialAd.onError((err) => {})
      interstitialAd.onClose(() => {})
    }

    // var that = this;
    // getGlobalSettings('recognize').then(settings => {
    //   interfaceURL = settings.interfaceURL;
    //   secretKey = settings.secretKey;
    // })

    this.checkAuth();
  },

  onShow(){
    var that = this;
    if (!interfaceURL || !secretKey) {
      getGlobalSettings('recognize').then(settings => {
        interfaceURL = settings.interfaceURL;
        secretKey = settings.secretKey;
      }).then(that.recognizeChatImage);
    }else{// 没杀后台回到聊天重新识别的情况
      this.recognizeChatImage()
    }
  },

  recognizeChatImage(){
    var that = this;
    var launchOptions = wx.getEnterOptionsSync();
    var chatImage = launchOptions.forwardMaterials[0].path;
    console.log("lanOpt:",launchOptions);
    if(this.data.photoPath) {
      return;
    }
    if(launchOptions.scene === 1173){
      //从聊天素材打开，识别素材图片
      that.setData({
        photoPath: chatImage,
        photoBase64: wx.getFileSystemManager().readFileSync(chatImage, 'base64')
      });
      that.recognizePhoto();
    }
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
          photoPath: res.tempImagePath,
          photoBase64: wx.getFileSystemManager().readFileSync(res.tempImagePath, 'base64')
        });
        that.recognizePhoto();
      }
    });
  },

  async recognizePhoto() {
    // 检查接口设置
    if (!interfaceURL || !secretKey) {
      wx.showToast({
        icon: 'error',
        title: '出错了'
      });
      console.log("no interfaceURL || secretKey");
      return;
    }
    wx.showLoading({
      title: '翻阅猫谱中...',
      mask: true
    });
    // 压缩图片
    const compressPhotoPath = await this.compressPhoto();
    // 计算签名
    const photoBase64 = wx.getFileSystemManager().readFileSync(compressPhotoPath, 'base64');
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = sha256.hex_sha256(photoBase64 + timestamp + secretKey);
    // 调用服务端接口进行识别
    const that = this;
    wx.uploadFile({
      filePath: compressPhotoPath,
      name: 'photo',
      url: interfaceURL,
      formData: {
        timestamp: timestamp,
        signature: signature
      },
      timeout: 10 * 1000, // 10s超时
      async success(resp) {
        try {
          if (resp.statusCode != 200) {
            throw resp.data;
          }
          const res = JSON.parse(resp.data); // 这里也可能抛出异常
          if (res.ok === true) {
            await that.loadRecognizeResult(res.data);
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
    });
  },

  async compressPhoto() {
    // 获取图像宽高信息
    const photoInfo = await wx.getImageInfo({
      src: this.data.photoPath,
    });
    console.log('photo info:', photoInfo);
    // 记录图片长宽比。用于重新映射后端返回的catBox位置信息。
    widthHeightRatio = photoInfo.width / photoInfo.height;
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
          destWidth: drawWidth,
          destHeight: drawHeight,
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

  async loadRecognizeResult(result) {
    // 解析猫猫框
    let catBoxes = result.catBoxes;
    let catBoxList = [];
    const previewSideLen = 675; // view#previewArea的长宽rpx值
    const compressSideLen = 500; // 上传到后台的图片的长边长度
    const ratio = previewSideLen / compressSideLen; // 缩放比
    for (let catBox of catBoxes) {
      let xOffset = 0;
      let yOffset = 0;
      // 短边由于居中会产生offset
      if (widthHeightRatio < 1) {
        xOffset = previewSideLen * ((1 - widthHeightRatio) / 2);
      } else {
        yOffset = previewSideLen * ((1 - 1 / widthHeightRatio) / 2);
      }
      catBoxList.push({
        x: catBox.xmin * ratio + xOffset,
        y: catBox.ymin * ratio + yOffset,
        width: (catBox.xmax - catBox.xmin) * ratio,
        height: (catBox.ymax - catBox.ymin) * ratio
      });
    }
    console.log("cat box list:", catBoxList);
    // 解析识别结果
    let recognizeResults = result.recognizeResults;
    let catList = [];
    // 最多maxNum只，最少minNum只，去除概率太低的
    const minProb = 0.001;
    const minNum = 3;
    const maxNum = 5;
    for (let index = 0; index < maxNum; index++) {
      if (recognizeResults[index].prob > minProb || index < minNum) {
        let cat = recognizeResults[index];
        let catInfo = await this.getCatInfo(cat);
        catList.push(catInfo);
      } else {
        break;
      }
    }
    console.log("cat list:", catList);
    this.setData({
      catBoxList: catBoxList,
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
    var total = catInfo.photo_count_best;
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
          photoPath: res.tempFilePaths[0],
          photoBase64: wx.getFileSystemManager().readFileSync(res.tempFilePaths[0], 'base64')
        });
        that.recognizePhoto();
      }
    });
  },

  reset() {
    this.setData({
      photoPath: null,
      photoBase64: null,
      catBoxList: [],
      catList: [],
      showResultBox: false
    });
    
    // 在适合的场景显示插屏广告
    // if (interstitialAd) {
    //   console.log("展示广告")
    //   interstitialAd.show().catch((err) => {
    //     console.error(err)
    //   })
    // }
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
  },

  adLoad() {
    console.log('Banner 广告加载成功')
    this.setData({showAdBox: true});
  },
  adError(err) {
    console.log('Banner 广告加载失败', err)
    this.setData({showAdBox: false});
  },
  adClose() {
    console.log('Banner 广告关闭')
    this.setData({showAdBox: false});
  }

})