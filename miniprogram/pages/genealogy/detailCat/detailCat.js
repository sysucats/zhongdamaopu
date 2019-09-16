const utils = require('../../../utils.js');
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;
const getGlobalSettings = utils.getGlobalSettings;

const ctx = wx.createCanvasContext('bigPhoto');

// 页面设置，从global读取
var page_settings = {};
var photoMax = 0;
var albumMax = 0;
var cat_id;

var album_raw = []; // 这里放的是raw数据
var loadingAlbum = false;

var infoHeight = 0; // 单位是px
const canvasMax = 2000; // 正方形画布的尺寸px

var heights = {}; // 系统的各种heights

function check_multi_click(cat_id) {
  const last_click = wx.getStorageSync(cat_id);
  if(!cat_id) {
    return false;
  }
  const today = new Date();
  const delta = today - (new Date(last_click));
  console.log("last click: " + (delta / 1000 / 3600));
  // 小于2小时就返回true，说明是一个multi-click
  return (delta/1000/3600) < 2;
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cat: {},
    album: [], // 所有照片
    bottomText: 'LOADING...',
    showHoverHeader: false, // 显示浮动的相册标题
    hideBgBlock: false, // 隐藏背景黄块
    canvas: {}, // 画布的宽高
    canUpload: false, // 是否可以上传照片
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    cat_id = options.cat_id;

    // 开始加载页面
    const that = this;
    const app = getApp();
    getGlobalSettings('detailCat').then(settings => {
      // 先把设置拿到
      page_settings = settings;
      // 启动加载
      that.loadCat();
      // 是否开启上传功能
      console.log("settings:", settings);
      console.log("App:", app);
      that.setData({
        canUpload: (settings.cantUpload !== app.globalData.version)
      });
    })
    
    // 先判断一下这个用户在12小时之内有没有点击过这只猫
    if (!check_multi_click(cat_id)) {
      console.log("add click!");
      wx.setStorage({
        key: cat_id,
        data: new Date(),
      });
      // 增加click数
      wx.cloud.callFunction({
        name: 'addPop',
        data: {
          cat_id: cat_id
        }
      }).then(res => {
        console.log(res);
      });
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {
    // 获取一下屏幕高度
    wx.getSystemInfo({
      success: res => {
        console.log(res);
        heights = {
          "screenHeight": res.screenHeight,
          "windowHeight": res.windowHeight,
          "rpx2px": res.windowWidth / 750,
          "pixelRatio": res.pixelRatio
        }
      }
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    console.log(shareTo(this.data.cat.name + ' - 中大猫谱', path))
    return shareTo(this.data.cat.name + ' - 中大猫谱', path);
  },
  
  swiperLast(e) {
    const current = e.detail.current;
    if (current === this.data.cat.photo.length - 1) {
      this.loadMorePhotos(this.data.cat._id);
    }
  },

  loadCat() {
    const db = wx.cloud.database();
    db.collection('cat').doc(cat_id).get().then(res => {
      console.log(res);
      res.data.photo = [];
      // res.data.characteristics_string = [(res.data.colour || '') + '猫'].concat(res.data.characteristics || []).join('，');
      res.data.characteristics_string = (res.data.colour || '') + '猫';
      // res.data.nickname = (res.data.nickname || []).join('、');
      this.setData({
        cat: res.data
      }, ()=> {
        this.reloadPhotos();
        var query = wx.createSelectorQuery();
        query.select('#info-box').boundingClientRect();
        query.exec((res) => {
          console.log(res[0]);
          infoHeight = res[0].height;
        })
      });
    });
  },

  reloadPhotos() {
    // 这些是精选照片
    const qf = { cat_id: cat_id, verified: true, best: true };
    const db = wx.cloud.database();
    db.collection('photo').where(qf).count().then(res => {
      photoMax = res.total;
      this.loadMorePhotos();
    });
    // 下面是相册的
    const qf_album = { cat_id: cat_id, verified: true };
    db.collection('photo').where(qf_album).count().then(res => {
      albumMax = res.total;
      album_raw = [];
      this.loadMoreAlbum();
      this.setData({
        albumMax: albumMax
      });
    });
  },

  loadMorePhotos() {
    var cat = this.data.cat;
    // 给这个参数是防止异步
    if (this.data.cat.photo.length >= photoMax) {
      return false;
    }

    const qf = { cat_id: cat_id, verified: true, best: true };
    const step = page_settings.photoStep;
    const now = cat.photo.length;

    const db = wx.cloud.database();
    console.log(qf);
    db.collection('photo').where(qf).orderBy('mdate', 'desc').skip(now).limit(step).get().then(res => {
      console.log(res);
      cat.photo = cat.photo.concat(res.data);
      this.setData({
        cat: cat
      });
    });
  },

  bindAddPhoto() {
    wx.navigateTo({
      url: '/pages/genealogy/addPhoto/addPhoto?cat_id=' + this.data.cat._id,
    });
  },
  bindTapPhoto(e) {
    const photo = e.currentTarget.dataset.photo;
    // 已经有水印图了
    if (photo.photo_watermark) {
      wx.previewImage({
        urls: [photo.photo_watermark],
      });
      return false;
    }
    wx.showLoading({
      title: '加载大图中...',
    });
    console.log(photo);
    const userInfo = photo.userInfo;
    const shooting_date = photo.shooting_date;
    var url = photo.photo_id;
    const that = this;
    // 先用canvas加上水印
    wx.getImageInfo({
      src: url,
      success: function(res) {
        console.log(res);
        const draw_rate = Math.max(res.width, res.height) / canvasMax;
        const draw_width = res.width / draw_rate;
        const draw_height = res.height / draw_rate;
        console.log(draw_width, draw_height);
        // 画上图片
        ctx.drawImage(res.path, 0, 0, draw_width, draw_height);
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
            destWidth: res.width,
            destHeight: res.height,
            fileType: 'jpg',
            success: function (res) {
              console.log(res);
              wx.hideLoading();
              wx.previewImage({
                urls: [res.tempFilePath],
              });
            }
          }, that);
        });
      }
    })
  },
  bindImageLoaded(e) {
    // console.log(e);
  },

  // 下面开始加载相册咯
  // 相册和上面的photo不同的地方在于，有没有best=true这个条件
  // 而且相册的东西还要再处理一下，分开拍摄年月
  loadMoreAlbum() {
    if (loadingAlbum) {
      return false;
    }

    if (album_raw.length >= albumMax) {
      console.log("No more album.");
      this.setData({
        bottomText: '- THE END -'
      })
      return false;
    }
    const qf = { cat_id: cat_id, verified: true };
    const step = page_settings.albumStep;
    const now = album_raw.length;

    const db = wx.cloud.database();
    
    const that = this;

    loadingAlbum = true;
    db.collection('photo').where(qf).orderBy('shooting_date', 'desc').orderBy('mdate', 'desc').skip(now).limit(step).get().then(res => {
      console.log(res);
      // 处理一下时间shooting_date
      album_raw = album_raw.concat(res.data);
      that.updateAlbum();
    });
  },

  updateAlbum() {
    // 为了页面显示，要把这个结构处理一下
    // 先按日期分类
    var group = {};
    for (const pic of album_raw) {
      const date = pic.shooting_date;
      if (!date) {
        continue;
      }
      if(!(date in group)) {
        group[date] = [];
      }
      group[date].push(pic);
    }
    // 下面整理一下，变成页面能展示的
    var result = [];
    var keys = Object.keys(group);
    keys.sort((a, b) => -(a - b));
    for (const key of keys) {
      const shooting_date = key.split('-');
      var birth = this.data.cat.birthday;
      var age = [-1, -1];
      if (birth) {
        birth = birth.split('-');
        var month = parseInt(shooting_date[1]) - parseInt(birth[1]);
        var year = parseInt(shooting_date[0]) - parseInt(birth[0]);
        if (month < 0) {
          month += 12;
          year -= 1;
        }
        age[0] = year;
        age[1] = month;
      }
      result.push({
        date: shooting_date,
        photos: group[key],
        age: age
      });
    }
    console.log(result);
    loadingAlbum = false;
    this.setData({
      album: result
    });
  },
  // 处理主容器滑动时的行为
  bindContainerScroll(e) {
    const rpx2px = heights.rpx2px;
    // 先保证这两个数字拿到了，再开始逻辑
    if (rpx2px && infoHeight) {
      const showHoverHeader = this.data.showHoverHeader;
      // 这个是rpx为单位的
      const to_top = e.detail.scrollTop / rpx2px;
      // 判断是否要显示/隐藏悬浮标题（精选图的高度+信息栏的高度）
      const hover_thred = 470 + (infoHeight / rpx2px);
      if ((to_top > hover_thred && showHoverHeader == false) || (to_top < hover_thred && showHoverHeader == true)) {
        this.setData({
          showHoverHeader: !showHoverHeader
        });
      }

      
      const hideBgBlock = this.data.hideBgBlock;
      // 判断是否要隐藏背景颜色块的高度
      const hide_bg_thred = 150;
      if ((to_top > hide_bg_thred && hideBgBlock == false) || (to_top < hide_bg_thred && hideBgBlock == true)) {
        this.setData({
          hideBgBlock: !hideBgBlock
        });
      }
    }
  },

  // 展示mpcode
  bingMpTap(e) {
    // 直接显示
    if (this.data.cat.mpcode) {
      wx.previewImage({
        urls: [this.data.cat.mpcode],
      });
      return false;
    }
    // 如果目前没有，那就先生成一个，再显示
    console.log('生成mpcode');
    wx.showLoading({
      title: '生成ing...',
    })
    const that = this;
    const cat = this.data.cat;
    wx.cloud.callFunction({
      name: 'getMpCode',
      data: {
        _id: cat._id,
        scene: 'toC=' + cat._no,
        page: 'pages/genealogy/genealogy',
        width: 500,
      },
      success: (res) => {
        wx.hideLoading();
        console.log(res);
        wx.previewImage({
          urls: [res.result],
        });
        that.setData({
          'cat.mpcode': res.result
        });
      }
    })
  },
})