import {
  text as text_cfg,
  cat_status_adopt
} from "../../../../config";
import {
  hex_sha256,
  randomInt
} from "../../../../utils/utils";
import {
  loadFilter,
  getGlobalSettings
} from "../../../../utils/page";

import drawUtils from "../../../../utils/draw";
import { signPhotoUrls } from  "../../../../utils/cat";
import api from "../../../../utils/cloudApi";

const share_text = text_cfg.app_name + ' - ' + text_cfg.recognize.share_tip;
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    cameraAuth: false,
    devicePosition: 'back', // 前置/后置摄像头
    photoPath: null, // 用户选择的照片的路径
    photoBase64: null, // 用户选择的照片的base64编码，用于设置background-image
    campusList: ['所有校区'],
    campusIndex: 0,
    campusIndexOld: 0,
    lastFilterType: '',
    colourIndexOld: 0,
    colourList: ['所有花色'],
    colourIndex: 0,
    catList: [], // 展示的猫猫列表
    catBoxList: [], // 展示的猫猫框列表
    catIdx: null, // 在有多只猫猫的图片中，识别的猫猫的编号（UI 高亮用，= 数组位置）
    catMeowIdx: null, // 传给后端的候选下标（取自 catBox.index），与数组位置可能不一致
    quota: null, // 今日识别额度 { left, limit, used, adEnabled, adBonus, adLeft }，由云函数返回
    unknownCat: false, // 检测到猫但身份未确认
    videoAdLoaded: false, // 激励视频是否就绪
    showResultBox: false, // 用来配合动画延时展示resultBox
    showAdBox: true, // 展示banner广告
    ad: {},
    text_cfg: text_cfg,

    // 领养状态
    adopt_desc: cat_status_adopt,
  },

  jsData: {
    // 接口秘钥，onShow中从数据库拉取。
    secretKey: null,
    canvasSideLen: 500,
    // 图片长宽比，在compresPhoto函数中记录。用于重新映射后端返回的catBox位置信息。
    widthHeightRatio: null,
    // 接口返回的识别结果。展示的结果为在此基础上筛选。
    recognizeResults: [],
  },

  async onLoad() {
    var res = await loadFilter();
    console.log('filterRes:', res);
    this.setData({
      campusList: ['所有校区'].concat(res.campuses),
      colourList: ['所有花色'].concat(res.colour)
    })

    this.checkAuth();

    // 设置广告ID
    const ads = await getGlobalSettings('ads') || {};
    this.setData({
      ad: {
        banner: ads.recognize_banner
      },
    })

    this.loadRewardAd(ads);
  },

  // 激励视频：看广告领识别次数，用法与徽章模块一致。
  // 注意：广告完成回调只是客户端事件，不构成服务端凭证；
  // 是否真的发放由云函数的 RECOGNIZE_AD_ENABLED 决定，并有每日领取上限。
  loadRewardAd(ads) {
    if (!wx.createRewardedVideoAd) {
      return;
    }
    // 优先用识猫页专属广告位，没配就回退到徽章页的激励视频位
    const adUnitId = ads.recognize_video || ads.badge_video;
    if (!adUnitId) {
      console.log('未配置激励视频广告位');
      return;
    }
    const videoAd = wx.createRewardedVideoAd({ adUnitId });
    videoAd.onLoad(() => {
      this.setData({ videoAdLoaded: true });
    });
    videoAd.onError((err) => {
      console.log('reward ad error:', err);
      this.setData({ videoAdLoaded: false });
    });
    videoAd.onClose(async (res) => {
      // 没看完不给奖励
      if (!res || !res.isEnded) {
        return;
      }
      await this.grantBonus();
    });
    this.jsData.videoAd = videoAd;
  },

  async grantBonus() {
    wx.showLoading({ title: '领取中...', mask: true });
    try {
      const res = await api.catFace({ action: 'grantBonus' });
      wx.hideLoading();
      if (res && res.ok === true && res.quota) {
        this.setData({ quota: res.quota });
        wx.showToast({
          icon: 'none',
          title: `已获得 ${res.bonus} 次识别机会`,
          duration: 2000
        });
        return;
      }
      const code = res && res.code;
      let title = '领取失败，请稍后再试';
      if (code === 'bonus_not_supported') title = '暂未开启广告奖励';
      else if (code === 'bonus_exhausted') title = '今日广告奖励已领完';
      else if (res && res.msg) title = String(res.msg).slice(0, 30);
      wx.showToast({ icon: 'none', title: title, duration: 2500 });
    } catch (e) {
      console.log('grantBonus error:', e);
      wx.hideLoading();
      wx.showToast({ icon: 'none', title: '网络或服务异常' });
    }
  },

  tapRewardAd() {
    const ad = this.jsData.videoAd;
    if (!ad) {
      wx.showToast({ icon: 'none', title: '广告未就绪' });
      return;
    }
    ad.show().catch(() => {
      wx.showToast({ icon: 'none', title: '广告拉取失败，请稍后重试' });
    });
  },

  async onShow() {
    if (!this.jsData.secretKey) {
      var settings = await getGlobalSettings('recognize');
      this.jsData.secretKey = settings.secretKey;
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
        that.reset(); // 清空上一张照片的识别状态
        that.setData({
          photoPath: res.tempImagePath,
          photoBase64: wx.getFileSystemManager().readFileSync(res.tempImagePath, 'base64')
        });
        that.recognizePhoto();
      }
    });
  },

  async recognizePhoto() {
    // 检查接口设置：未配置 secretKey 时不上签名，云函数端同样会跳过校验
    // （原逻辑是没密钥直接报错退出；MeowID 方案下签名是可选的）
    if (!this.jsData.secretKey) {
      console.log("no secretKey，本次请求不带签名");
    }
    wx.showLoading({
      title: '翻阅猫谱中...',
      mask: true
    });
    // 压缩图片
    const compressPhotoPath = await this.compressPhoto();

    const compressPhotoInfo = await wx.getImageInfo({
      src: compressPhotoPath,
    });
    this.jsData.compressPhotoInfo = compressPhotoInfo;
    console.log("compressPhotoInfo", compressPhotoInfo);

    // 计算签名
    const photoBase64 = wx.getFileSystemManager().readFileSync(compressPhotoPath, 'base64');
    console.log(photoBase64);
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = hex_sha256(photoBase64 + timestamp + this.jsData.secretKey);
    // 调用云函数 catFace 进行识别
    const params = {
      photoBase64: photoBase64,
    };
    if (this.jsData.secretKey) {
      params.signature = signature;
      params.timestamp = timestamp;
    }
    // 传后端候选下标（catBox.index）而非数组位置，避免部分候选没有框时错位
    if (this.data.catMeowIdx !== null && this.data.catMeowIdx !== undefined) {
      params.catIdx = this.data.catMeowIdx;
    }
    console.log(params);
    try {
      const res = await api.catFace(params);
      // 额度信息（云函数成功时一并返回 { left, limit, used }）
      if (res && res.quota) {
        this.setData({ quota: res.quota });
      }
      if (!res || res.ok !== true) {
        // 服务错误 / 额度不足：不能解释成"照片里没有猫"
        const code = (res && res.code) || '';
        let title = '识别失败，请稍后再试';
        if (code === 'quota_exceeded') title = '今日识别次数用完啦~';
        else if (code === 'expired') title = '请求已过期，请重试';
        else if (code === 'bad_signature') title = '校验失败，请重试';
        else if (code === 'not_configured') title = '识猫服务未配置';
        else if (res && res.msg) title = String(res.msg).slice(0, 30);
        wx.hideLoading();
        wx.showToast({ icon: 'none', title: title, duration: 2500 });
        wx.reportMonitor('recognizeCatPhotoError', 1);
        return;
      }
      const data = res.data || {};
      // 检测到猫但云端身份未确认（有候选也不能自动认定）
      this.setData({ unknownCat: !!data.unknown });
      if (!data.catCount) {
        // 没检测到猫：后端此时不扣次数，用专门文案
        wx.hideLoading();
        wx.showToast({ icon: 'none', title: text_cfg.recognize.no_cat_tip, duration: 2000 });
        return;
      }
      await this.loadRecognizeResult(data);
    } catch (err) {
      console.log('get error from catFace:', err);
      wx.hideLoading();
      wx.showToast({
        icon: 'none',
        title: '网络或服务异常'
      });
      wx.reportMonitor('recognizeCatPhotoError', 1);
    }
  },

  async compressPhoto() {
    // 获取图像宽高信息
    const photoInfo = await wx.getImageInfo({
      src: this.data.photoPath,
    });
    console.log('photo info:', photoInfo);
    // 记录图片长宽比。用于重新映射后端返回的catBox位置信息。
    this.jsData.widthHeightRatio = photoInfo.width / photoInfo.height;
    // 使用canvas方法压缩图片
    const { canvasSideLen } = this.jsData;
    const drawRate = Math.max(photoInfo.width, photoInfo.height) / canvasSideLen; // 计算缩放比
    const drawWidth = photoInfo.width / drawRate;
    const drawHeight = photoInfo.height / drawRate;
    if (!this.jsData.ctx) {
      const { ctx, canvas } = await drawUtils.initCanvas('#canvasForCompress');
      this.jsData.ctx = ctx;
      this.jsData.canvas = canvas;
    }
    const { ctx, canvas } = this.jsData;
    await drawUtils.drawImage(ctx, canvas, photoInfo.path, 0, 0, drawWidth, drawHeight);

    const compressPhotoPath = await drawUtils.getTempPath(ctx, canvas, {
      width: drawWidth,
      height: drawHeight,
      destWidth: drawWidth,
      destHeight: drawHeight,
      fileType: 'jpg'
    });

    return compressPhotoPath;
  },

  async loadRecognizeResult(result) {
    // 解析猫猫框
    let catBoxes = result.catBoxes;
    let catBoxList = [];
    const previewSideLen = 675; // view#previewArea的长宽rpx值
    const compressSideLen = this.jsData.canvasSideLen; // 上传到后台的图片的长边长度
    const ratio = previewSideLen / compressSideLen; // 缩放比
    const { compressPhotoInfo } = this.jsData;
    for (let catBox of catBoxes) {
      let xOffset = 0, yOffset = 0;
      // 短边由于居中会产生offset
      if (this.jsData.widthHeightRatio < 1) {
        xOffset = previewSideLen * ((1 - this.jsData.widthHeightRatio) / 2);
      } else {
        yOffset = previewSideLen * ((1 - 1 / this.jsData.widthHeightRatio) / 2);
      }
      console.log(catBox, ratio, xOffset, yOffset, previewSideLen);

      // PC端压缩后的照片，尺寸不一定是500
      const realDrawRate = compressSideLen / Math.max(compressPhotoInfo.width, compressPhotoInfo.height);

      catBoxList.push({
        // 后端候选下标，点击框重新识别时回传（不能直接用数组位置）
        meowIdx: catBox.index,
        x: catBox.xmin * realDrawRate * ratio + xOffset,
        y: catBox.ymin * realDrawRate * ratio + yOffset,
        width: (catBox.xmax - catBox.xmin) * realDrawRate * ratio,
        height: (catBox.ymax - catBox.ymin) * realDrawRate * ratio
      });
    }
    console.log("cat box list:", catBoxList);
    this.setData({
      catBoxList: catBoxList
    });
    // 识别结果：MeowID 侧已登记但本地没绑定的猫会拿不到结果
    const results = result.recognizeResults || [];
    if (!results.length) {
      wx.hideLoading();
      wx.showToast({
        icon: 'none',
        title: '这只猫猫还没登记，暂时认不出来~',
        duration: 2500
      });
      return;
    }
    this.jsData.recognizeResults = await Promise.all(results.map(this.getCatInfo));
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
      [type + 'IndexOld']: this.data[type + 'Index'],
      lastFilterType: type,
      [type + 'Index']: res.detail.value
    })
    this.pickCatList();
  },

  async pickCatList() {
    wx.showLoading({
      title: '筛选中...',
    })

    const that = this;
    console.log("recognizeResults:", this.jsData.recognizeResults);
    const choseCampus = that.data.campusList[that.data.campusIndex];
    const choseColour = that.data.colourList[that.data.colourIndex];
    const catList = this.jsData.recognizeResults.filter(cat => {
      if ((choseCampus === cat.campus || choseCampus === "所有校区") && (choseColour === cat.colour || choseColour === "所有花色")) {
        return true; //筛选结果
      }
    });

    console.log("catList:", catList);
    if (catList.length === 0) {
      wx.hideLoading();
      this.setData({
        [this.data.lastFilterType + 'Index']: this.data[this.data.lastFilterType + "IndexOld"] // 无筛选结果，恢复原选项
      })
      wx.showToast({
        title: '找不到这样的猫猫，试试换个选项吧',
        duration: 2000,
        icon: 'none',
        mask: true
      })
      return false;
    } else {
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
    } else {
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
    // const scores = catList.map(item => item.score);
    // const maxScore = scores.reduce((prev, cur) => Math.max(prev, cur));
    // const expScoreSum = scores.reduce((prev, cur) => prev + Math.exp(cur - maxScore), 0);
    catList.forEach(item => {
      // 目前的 yolo 识猫模型，会直接输出概率，不需要再次 softmax
      item.prob = item.score;
      // item.prob = Math.exp(item.score - maxScore) / expScoreSum;
    });
  },

  async getCatInfo(cat) {
    const { result: catInfo } = await app.mpServerless.db.collection('cat').findOne({ _id: cat.catID });
    catInfo.score = cat.score;
    return catInfo;
  },

  async getCatPhoto(catInfo) {
    // 从精选照片里随机挑选一张
    const query = {
      cat_id: catInfo._id,
      verified: true,
      best: true
    };
    var total = catInfo.photo_count_best;
    var index = randomInt(0, total);
    var { result: photoURL } = await app.mpServerless.db.collection('photo').findOne(query, { skip: index });
    const signedPhotoURL = await signPhotoUrls(photoURL);
    return signedPhotoURL;
  },

  async choosePhoto() {
    var res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ["compressed"],
      sourceType: ['album'],
    })

    const filePath = res.tempFiles[0].tempFilePath;
    this.reset(); // 清空上一张照片的识别状态（含 catIdx / catMeowIdx）
    this.setData({
      photoPath: filePath,
      photoBase64: wx.getFileSystemManager().readFileSync(filePath, 'base64')
    });
    this.recognizePhoto();
  },

  reset() {
    this.setData({
      photoPath: null,
      photoBase64: null,
      catBoxList: [],
      catList: [],
      catIdx: null,
      catMeowIdx: null,
      unknownCat: false,
      showResultBox: false,
      campusIndex: 0,
      colourIndex: 0
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

  tapCatBox(e) {
    const index = e.currentTarget.dataset.index;
    const box = this.data.catBoxList[index];
    const currentCatIdx = this.data.catIdx in this.data.catBoxList ? this.data.catIdx : 0;
    if (index !== currentCatIdx) {
      this.setData({
        catList: [],
        showResultBox: false,
        catIdx: index,
        // 回传后端候选下标（没有就退回数组位置）
        // 注意：切换猫会重新调用识别，并按后端规则再次计入次数
        catMeowIdx: box && box.meowIdx !== undefined ? box.meowIdx : index,
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