const config = require('../../../config.js');
const utils = require('../../../utils.js');
const shareTo = utils.shareTo;
const getCurrentPath = utils.getCurrentPath;
const getGlobalSettings = utils.getGlobalSettings;
const checkCanUpload = utils.checkCanUpload;
const checkMultiClick = utils.checkMultiClick;
const formatDate = utils.formatDate;

const getCatCommentCount = require('../../../comment.js').getCatCommentCount;

const cat_utils = require('../../../cat.js');
const setVisitedDate = cat_utils.setVisitedDate;

const text_cfg = config.text;

const no_heic = /^((?!\.heic$).)*$/i; // 正则表达式：不以 HEIC 为文件后缀的字符串

// 页面设置，从global读取
var page_settings = {};
var photoMax = 0;
var albumMax = 0;
var cat_id;

var album_raw = []; // 这里放的是raw数据
var loadingAlbum = false;

var whichGallery; // 预览时记录展示的gallery是精选还是相册

var infoHeight = 0; // 单位是px

var heights = {}; // 系统的各种heights

// 获取照片的排序功能
const photoOrder = [
  {key: 'shooting_date', order: 'desc', name: '最近拍摄'},
  {key: 'shooting_date', order: 'asc', name: '最早拍摄'},
  {key: 'mdate', order: 'desc', name: '最近收录'},
  {key: 'mdate', order: 'asc', name: '最早收录'},
]

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cat: {},
    album: [], // 所有照片
    bottomText: text_cfg.detail_cat.bottom_text_loading,
    showHoverHeader: false, // 显示浮动的相册标题
    hideBgBlock: false, // 隐藏背景黄块
    canvas: {}, // 画布的宽高
    canUpload: false, // 是否可以上传照片
    showGallery: false,
    imgCompressedUrls: [], // 预览组件使用的URLs
    imgUrls: [], // 预览组件使用的URLs
    currentImg: 0, // 预览组件当前预览的图片
    photoOrderSelectorRange: photoOrder,
    photoOrderSelectorKey: "name",
    photoOrderSelected: 0,

    // 领养状态
    adopt_desc: config.cat_status_adopt,
    text_cfg: text_cfg,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    cat_id = options.cat_id;
    // 开始加载页面
    const that = this;
    getGlobalSettings('detailCat').then(settings => {
      // 先把设置拿到
      page_settings = settings;
      that.setData({
        photoPopWeight: settings['photoPopWeight'] || 10
      });
      // 启动加载
      that.loadCat();
      // 是否开启上传功能
      
      
      checkCanUpload().then(res => {
        that.setData({
          canUpload: res
        });
      })
    })
    
    // 先判断一下这个用户在12小时之内有没有点击过这只猫
    if (!checkMultiClick(cat_id)) {
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

    // 记录访问时间，消除“有新相片”
    setVisitedDate(cat_id);
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
    const share_text = `${this.data.cat.name} - ${text_cfg.app_name}`;
    console.log(shareTo(share_text, path))
    return shareTo(share_text, path);
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
        this.loadCommentCount();
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
    const db = wx.cloud.database();
    // 1/4处 屏蔽以 HEIC 为文件后缀的图片
    const qf = { cat_id: cat_id, verified: true, best: true, photo_id: no_heic };
    db.collection('photo').where(qf).count().then(res => {
      photoMax = res.total;
      this.loadMorePhotos();
    });
    this.reloadAlbum();
  },

  loadCommentCount() {
    const that = this;
    getCatCommentCount(cat_id).then(count => {
      console.log(count);
      that.setData({
        "cat.comment_count": count
      });
    })
  },

  reloadAlbum() {
    // 下面是相册的
    const db = wx.cloud.database();
    // 2/4处 屏蔽以 HEIC 为文件后缀的图片
    const qf_album = { cat_id: cat_id, verified: true, photo_id: no_heic };
    db.collection('photo').where(qf_album).count().then(res => {
      albumMax = res.total;
      album_raw = [];
      this.loadMoreAlbum();
      this.setData({
        albumMax: albumMax
      });
    });
  },

  async loadMorePhotos() {
    var cat = this.data.cat;
    // 给这个参数是防止异步
    if (this.data.cat.photo.length >= photoMax) {
      return false;
    }
    // 3/4处 屏蔽以 HEIC 为文件后缀的图片
    const qf = { cat_id: cat_id, verified: true, best: true, photo_id: no_heic };
    const step = page_settings.photoStep;
    const now = cat.photo.length;

    wx.showLoading({
      title: '加载中...',
      mask: true
    })

    const db = wx.cloud.database();
    console.log(qf);
    let res = await db.collection('photo').where(qf).orderBy('mdate', 'desc').skip(now).limit(step).get();
    console.log(res);
    const offset = cat.photo.length;
    for (let i = 0; i < res.data.length; ++i) {
      res.data[i].index = offset + i; // 把index加上，gallery预览要用到
    }
    cat.photo = cat.photo.concat(res.data);
    this.setData({
      cat: cat
    });
  },
  bindTapFeedback() {
    wx.navigateTo({
      url: '/pages/genealogy/feedbackDetail/feedbackDetail?cat_id=' + this.data.cat._id,
    });
  },

  bindAddPhoto() {
    wx.navigateTo({
      url: '/pages/genealogy/addPhoto/addPhoto?cat_id=' + this.data.cat._id,
    });
  },
  async bindTapPhoto(e) {
    wx.showLoading({
      title: '正在加载...',
      mask: true,
    })
    this.currentImg = e.currentTarget.dataset.index;
    // 预览到最后preload张照片时预加载
    const preload = page_settings.galleryPreload;
    whichGallery = e.currentTarget.dataset.kind;
    if (whichGallery == 'best') {
      if (this.data.cat.photo.length - this.currentImg <= preload) await this.loadMorePhotos(); //preload
      var photos = this.data.cat.photo;
    } else if (whichGallery == 'album') {
      if (album_raw.length - this.currentImg <= preload) await this.loadMoreAlbum(); // preload
      var photos = album_raw;
    }

    this.imgCompressedUrls = photos.map((photo) => {
      return (photo.photo_compressed || photo.photo_watermark || photo.photo_id);
    });
    this.imgUrls = photos.map((photo) => {
      return (photo.photo_watermark || photo.photo_id);
    });
    this.setData({
      showGallery: true,
      imgUrls: this.imgUrls,
      imgCompressedUrls: this.imgCompressedUrls,
      currentImg: this.currentImg,
    });
    wx.hideLoading();
  },

  async bindGalleryChange(e) {
    const index = e.detail.current;
    this.currentImg = index; // 这里得记一下，保存的时候需要
    // preload逻辑
    const preload = page_settings.galleryPreload;
    if (whichGallery == 'best' && this.imgUrls.length - index <= preload && this.imgUrls.length < photoMax) {
      console.log("加载更多精选图");
      await this.loadMorePhotos(); //preload
      
      var photos = this.data.cat.photo;
    } else if (whichGallery == 'album' && this.imgUrls.length - index <= preload && this.imgUrls.length < albumMax) { //album
      await this.loadMoreAlbum(); // preload
      var photos = album_raw;
    } else {
      return;
    }
    
    this.imgCompressedUrls = photos.map((photo) => {
      return (photo.photo_compressed || photo.photo_watermark || photo.photo_id);
    });
    this.imgUrls = photos.map((photo) => {
      return (photo.photo_watermark || photo.photo_id);
    });
    this.setData({
      imgCompressedUrls: this.imgCompressedUrls,
      imgUrls: this.imgUrls
    });
  },

  bindImageLoaded(e) {
    // console.log(e);
    wx.hideLoading();
  },

  // 下面开始加载相册咯
  // 相册和上面的photo不同的地方在于，有没有best=true这个条件
  // 而且相册的东西还要再处理一下，分开拍摄年月
  async loadMoreAlbum() {
    if (loadingAlbum) {
      return false;
    }

    if (album_raw.length >= albumMax) {
      this.setData({
        bottomText: text_cfg.detail_cat.bottom_text_end
      })
      return false;
    }
    // 4/4处 屏蔽以 HEIC 为文件后缀的图片
    const qf = { cat_id: cat_id, verified: true, photo_id: no_heic };
    const step = page_settings.albumStep;
    const now = album_raw.length;

    const db = wx.cloud.database();

    loadingAlbum = true;
    const orderItem = photoOrder[this.data.photoOrderSelected];
    let res = await db.collection('photo').where(qf).orderBy(orderItem.key, orderItem.order).orderBy('mdate', 'desc').skip(now).limit(step).get();
    const offset = album_raw.length;
    for (let i = 0; i < res.data.length; ++i) {
      res.data[i].index = offset + i; // 把index加上，gallery预览要用到
    }
    album_raw = album_raw.concat(res.data);
    this.updateAlbum();
  },

  updateAlbum () {
    // 为了页面显示，要把这个结构处理一下
    // 先按日期分类，分为拍摄日期、上传日期
    var orderIdx = this.data.photoOrderSelected;
    var orderKey = photoOrder[orderIdx].key;
    var group = {};
    for (const pic of album_raw) {
      var date;
      if (orderKey == 'shooting_date') {
        date = pic.shooting_date;
      } else if (orderKey == 'mdate') {
        date = formatDate(pic.mdate, 'yyyy-MM')
      }
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
    var order = photoOrder[orderIdx].order == 'asc'? 1: -1;
    keys.sort((a, b) => order * (a - b));
    for (const key of keys) {
      const shooting_date = key.split('-');
      var birth = this.data.cat.birthday;
      var age = [-1, -1];
      if (birth && orderKey == 'shooting_date') {
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

  bindphotoOrderChange(e) {
    var selected = e.detail.value;
    this.setData({
      photoOrderSelected: selected
    }, function() {
      this.reloadAlbum();
    })
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

  async bindGalleryLongPress(e) {
    const that = this;
    wx.showActionSheet({
      itemList: ['保存'],
      async success(res) {
        // 用户选择取消时不会回调success，不过还是判断一下吧
        if (res.tapIndex == 0) {
          console.log('保存图片');
          wx.showLoading({
            title: '正在保存...',
            mask: true,
          })
          let downloadRes = await wx.cloud.downloadFile({
            fileID: that.imgUrls[that.currentImg],
          });
          wx.hideLoading();
          if (downloadRes.errMsg == 'downloadFile:ok') {
            wx.saveImageToPhotosAlbum({
              filePath: downloadRes.tempFilePath,
              success(res) {
                wx.showToast({
                  title: '已保存到相册',
                  icon: 'success',
                })
              }
            });
          } else {
            console.log(downloadRes);
          }
        }
      },
    });
  },

  showPopularityTip() {
    wx.showToast({
      title: text_cfg.detail_cat.popularity_tip,
      icon: "none"
    });
  },

  showCommentTip() {
    wx.showToast({
      title: text_cfg.detail_cat.comment_tip,
      icon: "none"
    });
  },

  toComment() {
    const url = `/pages/genealogy/commentBoard/commentBoard?cat_id=${cat_id}`
    wx.navigateTo({
      url: url,
    })
  }
})