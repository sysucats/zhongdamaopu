import { text as text_cfg, cat_status_adopt } from "../../config";
import { hex_sha256, randomInt } from "../../utils";
import { loadFilter, getGlobalSettings, showTab } from "../../page";
import { cloud } from "../../cloudAccess";

// 接口设置，onLoad中从数据库拉取。
var interfaceURL;
var secretKey;

// 图片长宽比，在compresPhoto函数中记录。用于重新映射后端返回的catBox位置信息。
var widthHeightRatio;

// 接口返回的识别结果。展示的结果为在此基础上筛选。
var recognizeResults = [];

// 在页面中定义插屏广告
let interstitialAd = null

const share_text = text_cfg.app_name + ' - ' + text_cfg.recognize.share_tip;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cameraAuth: false,
    devicePosition: 'back', // 前置/后置摄像头
    photoPath: null, // 用户选择的照片的路径
    photoBase64: null, // 用户选择的照片的base64编码，用于设置background-image
    campusList:['所有校区'],
    campusIndex:0,
    campusIndexOld:0,
    lastFilterType:'',
    colourIndexOld:0,
    colourList:['所有花色'],
    colourIndex:0,
    catList: [], // 展示的猫猫列表
    catBoxList: [], // 展示的猫猫框列表
    catIdx: null, // 在有多只猫猫的图片中，识别的猫猫的编号
    showResultBox: false, // 用来配合动画延时展示resultBox
    showAdBox: true, // 展示banner广告
    ad: {},
    text_cfg: text_cfg,

    // 领养状态
    adopt_desc: cat_status_adopt,
  },

  async onLoad() {
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

    var res = await loadFilter();
    console.log('filterRes:', res);
    this.setData({
      campusList:['所有校区'].concat(res.campuses),
      colourList:['所有花色'].concat(res.colour)
    })

    this.checkAuth();

    // 设置广告ID
    const ads = await getGlobalSettings('ads') || {};
    this.setData({
      ad: {
        banner: ads.recognize_banner
      },
    })
  },

  async onShow() {
    // 切换自定义tab
    showTab(this);
    if (!interfaceURL || !secretKey) {
      console.log('__wxConfig.envVersion: ', __wxConfig.envVersion);
      var settings = await getGlobalSettings(__wxConfig.envVersion === 'release' ? 'recognize' : 'recognize_test');
      interfaceURL = settings.interfaceURL;
      secretKey = settings.secretKey;
      await this.recognizeChatImage();
    } else { // 没杀后台回到聊天重新识别的情况
      this.recognizeChatImage()
    }
  },


  recognizeChatImage() {
    var launchOptions = wx.getEnterOptionsSync();
    console.log("lanOpt:", launchOptions);
    if (launchOptions.scene !== 1173) {
      return;
    }
    var chatImage = launchOptions.forwardMaterials[0].path;
    if (this.data.photoPath === chatImage) {
      // 已经识别了
      return;
    }
    this.reset();
    //从聊天素材打开，识别素材图片
    this.setData({
      photoPath: chatImage,
      photoBase64: wx.getFileSystemManager().readFileSync(chatImage, 'base64')
    });
    this.recognizePhoto();
  },

  async checkAuth() {
    let setting = await wx.getSetting();
    console.log('auth setting:', setting.authSetting);
    this.setData({
      cameraAuth: setting.authSetting['scope.camera'] || false
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
    const signature = hex_sha256(photoBase64 + timestamp + secretKey);
    // 调用服务端接口进行识别
    const that = this;
    const formData = {
      timestamp: timestamp,
      signature: signature,
    };
    if (this.data.catIdx !== null) {
      formData.catIdx = this.data.catIdx;
    }
    wx.uploadFile({
      filePath: compressPhotoPath,
      name: 'photo',
      url: interfaceURL,
      formData: formData,
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
    this.setData({
      catBoxList: catBoxList
    });
    // 识别结果
    recognizeResults = await Promise.all(result.recognizeResults.map(this.getCatInfo));
    await this.pickCatList();
    wx.hideLoading();
    // 在布局完成上移后展示resultBox
    const that = this;
    setTimeout(() => {
      that.setData({
        showResultBox: true,
      });
    }, 500);
  },

  catFilter(res) {
    //点击筛选picker
    var type = res.currentTarget.dataset.type;
    this.setData({
      [type+'IndexOld']:this.data[type+'Index'],
      lastFilterType:type,
      [type+'Index'] :res.detail.value
    })
    this.pickCatList();
  },

  async pickCatList() {
    wx.showLoading({
      title: '筛选中...',
    })

    const that = this;
    console.log("recognizeResults:",recognizeResults);
    const choseCampus = that.data.campusList[that.data.campusIndex];
    const choseColour = that.data.colourList[that.data.colourIndex];
    const catList = recognizeResults.filter(cat => {
      if ((choseCampus === cat.campus || choseCampus === "所有校区") &&( choseColour === cat.colour || choseColour ==="所有花色")) {
        return true;//筛选结果
      }
    }
    ); 

    console.log("catList:", catList);
    if (catList.length === 0) {
      wx.hideLoading();
      this.setData({
        [this.data.lastFilterType+'Index']:this.data[this.data.lastFilterType+"IndexOld"]// 无筛选结果，恢复原选项
      })
      wx.showToast({
        title: '找不到这样的猫猫，试试换个选项吧',
        duration: 2000,
        icon: 'none',
        mask: true
      })
      return false;
    }else{
      this.calculateSoftmaxProb(catList);
    }

    let displayList = [];
    // 少于maxNum只全部展示；多于maxNum：最多maxNum只，最少minNum只，去除概率太低的
    const minProb = 0.001;
    const minNum = 3;
    const maxNum = 5;

    if (catList.length <= maxNum) {
      for (let index = 0; index < catList.length; index++) {
        const catInfo = catList[index];
        catInfo.photo = await this.getCatPhoto(catInfo);
        displayList.push(catInfo);
      }      
    }else{
      for (let index = 0; index < maxNum; index++) {
        if (catList[index].prob > minProb || index < minNum) {
          const catInfo = catList[index];
          catInfo.photo = await this.getCatPhoto(catInfo);
          displayList.push(catInfo);
        } else {
          break;
        }
      }
    }

    this.setData({
      catList: displayList
    });
    wx.hideLoading();
  },

  // 根据模型输出的得分（即每个对象的score属性）计算softmax概率，并将结果放到原对象的prob属性上
  calculateSoftmaxProb(catList) {
    const scores = catList.map(item => item.score);
    const maxScore = scores.reduce((prev, cur) => Math.max(prev, cur));
    const expScoreSum = scores.reduce((prev, cur) => prev + Math.exp(cur - maxScore), 0);
    catList.forEach(item => {
      item.prob = Math.exp(item.score - maxScore) / expScoreSum;
    });
  },

  async getCatInfo(cat) {
    const db = cloud.database();
    const catInfo = (await db.collection('cat').doc(cat.catID).get()).data;
    catInfo.score = cat.score;
    return catInfo;
  },

  async getCatPhoto(catInfo) {
    const db = cloud.database();
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
      catIdx: null,
      showResultBox: false,
      campusIndex:0,
      colourIndex:0
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

  tapCatBox(e) {
    const index = e.currentTarget.dataset.index;
    const currentCatIdx = this.data.catIdx in this.data.catBoxList ? this.data.catIdx : 0;
    if (index !== currentCatIdx) {
      this.setData({
        catList: [],
        showResultBox: false,
        catIdx: index,
      });
      this.recognizePhoto();
    }
  },

  onShareAppMessage() {
    return {
      title: share_text,
      imageUrl: '/pages/public/images/recognize/share_cover.jpg'
    };
  },
  onShareTimeline: function () {
    return this.onShareAppMessage();
  },

  adLoad() {
    console.log('Banner 广告加载成功')
    this.setData({
      showAdBox: true
    });
  },
  adError(err) {
    console.log('Banner 广告加载失败', err)
    this.setData({
      showAdBox: false
    });
  },
  adClose() {
    console.log('Banner 广告关闭')
    this.setData({
      showAdBox: false
    });
  }

})