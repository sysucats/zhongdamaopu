import config from "../../../config";
import {
  shareTo,
  getCurrentPath,
  checkMultiClick,
  formatDate,
  deepcopy
} from "../../../utils/utils";
import {
  checkCanUpload,
  checkCanComment,
  isManagerAsync,
  getUser
} from "../../../utils/user";
import {
  getCatCommentCount
} from "../../../utils/comment";
import {
  setVisitedDate,
  getAvatar,
  getCatItem
} from "../../../utils/cat";
import {
  getGlobalSettings
} from "../../../utils/page";
import {
  cloud
} from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";


import { loadUserBadge, loadBadgeDefMap, loadCatBadge, mergeAndSortBadges, } from "../../../utils/badge";

const no_heic = /^((?!\.heic$).)*$/i; // 正则表达式：不以 HEIC 为文件后缀的字符串

// 获取照片的排序功能
const photoOrder = [{
    key: 'shooting_date',
    order: 'desc',
    name: '最近拍摄'
  },
  {
    key: 'shooting_date',
    order: 'asc',
    name: '最早拍摄'
  },
  {
    key: 'mdate',
    order: 'desc',
    name: '最近收录'
  },
  {
    key: 'mdate',
    order: 'asc',
    name: '最早收录'
  },
]

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cat: {},
    album: [], // 所有照片
    bottomText: config.text.detail_cat.bottom_text_loading,
    showHoverHeader: false, // 显示浮动的相册标题
    hideBgBlock: false, // 隐藏背景黄块
    canvas: {}, // 画布的宽高
    canUpload: false, // 是否可以上传照片
    showGallery: false,
    galleryPhotos: [],
    currentImg: 0, // 预览组件当前预览的图片
    photoOrderSelectorRange: photoOrder,
    photoOrderSelectorKey: "name",
    photoOrderSelected: 0,

    // 领养状态
    adopt_desc: config.cat_status_adopt,
    text_cfg: config.text,

    activeUserBadge: -1,
  },

  jsData: {
    // 页面设置，从global读取
    page_settings: {},
    photoMax: 0,
    albumMax: 0,
    loadingAlbum: false,
    whichGallery: "", // 预览时记录展示的gallery是精选还是相册
    infoHeight: 0, // 单位是px
    heights: {}, // 系统的各种heights
    cat_id: "",
    album_raw: [],
    badgeDefMap: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.jsData.cat_id = options.cat_id;

    // 判断是否为管理员
    this.setData({
      is_manager: (await isManagerAsync(3))
    });

    // 先判断一下这个用户在12小时之内有没有点击过这只猫
    if (!checkMultiClick(this.jsData.cat_id)) {
      console.log("[onLoad] - Add click for cat", this.jsData.cat_id);
      wx.setStorage({
        key: this.jsData.cat_id,
        data: new Date(),
      });
      // 增加click数
      await api.curdOp({
        operation: "inc",
        type: "pop",
        collection: "cat",
        item_id: this.jsData.cat_id
      });
    }

    // 记录访问时间，消除“有新相片”
    // TODO：用cache
    setVisitedDate(this.jsData.cat_id);
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: async function () {
    // 获取一下屏幕高度
    wx.getSystemInfo({
      success: res => {
        console.log("[onReady] -", res);
        this.jsData.heights = {
          "screenHeight": res.screenHeight,
          "windowHeight": res.windowHeight,
          "rpx2px": res.windowWidth / 750,
          "pixelRatio": res.pixelRatio
        }
      }
    });

    // 开始加载页面
    this.jsData.page_settings = await getGlobalSettings('detailCat');
    this.setData({
      photoPopWeight: this.jsData.page_settings['photoPopWeight'] || 10
    });
    // 加载猫猫，是否开启上传、便利贴留言功能
    var [_, canUpload, canComment, _] = await Promise.all([
      this.loadCat(),
      checkCanUpload(),
      checkCanComment(),
      this.reloadUserBadge(),
    ]);
    this.setData({
      canUpload: canUpload,
      canComment: canComment
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {},

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const share_text = `${this.data.cat.name} - ${config.text.app_name}`;
    console.log("[onShareAppMessage] -", shareTo(share_text, path))
    return shareTo(share_text, path);
  },
  onShareTimeline: function () {
    return this.onShareAppMessage();
  },

  swiperLast(e) {
    const current = e.detail.current;
    if (current === this.data.cat.photo.length - 1) {
      this.loadMorePhotos(this.data.cat._id);
    }
  },

  async loadCat() {
    const db = await cloud.databaseAsync();
    const cat = (await db.collection('cat').doc(this.jsData.cat_id).get()).data;
    cat.photo = [];
    cat.characteristics_string = (cat.colour || '') + '猫';
    cat.avatar = await getAvatar(cat._id, cat.photo_count_best);

    this.setData({
      cat: cat
    });

    await Promise.all([
      this.reloadPhotos(),
      this.loadCommentCount(),
      this.loadRelations(),
      this.reloadCatBadge(),
    ]);

    var query = wx.createSelectorQuery();
    query.select('#info-box').boundingClientRect();
    query.exec((res) => {
      console.log("[loadCat] - ", res[0]);
      if (!res[0]) {
        return;
      }
      this.jsData.infoHeight = res[0].height;
    })
  },

  // 更新关系列表
  async loadRelations() {
    var cat = this.data.cat;
    var relations = this.data.cat.relations;
    console.log("[loadRelations] - ", cat);
    if (!cat._id || !relations) {
      return false;
    }

    for (var relation of relations) {
      relation.cat = await getCatItem(relation.cat_id)
      relation.cat.avatar = await getAvatar(relation.cat_id, relation.cat.photo_count_best);
    }

    console.log("[loadRelations] - ", relations);

    this.setData({
      "cat.relations": relations,
    });
  },

  async reloadPhotos() {
    // 这些是精选照片
    const db = await cloud.databaseAsync();
    const qf = {
      cat_id: this.jsData.cat_id,
      verified: true,
      best: true,
      photo_id: no_heic
    };
    this.jsData.photoMax = (await db.collection('photo').where(qf).count()).total;
    await Promise.all([
      this.loadMorePhotos(),
      this.reloadAlbum(),
    ]);
  },

  async loadCommentCount() {
    const that = this;

    that.setData({
      "cat.comment_count": await getCatCommentCount(this.jsData.cat_id)
    });
  },

  async reloadAlbum() {
    // 下面是相册的
    const db = await cloud.databaseAsync();
    const qf_album = {
      cat_id: this.jsData.cat_id,
      verified: true,
      photo_id: no_heic
    };
    this.jsData.albumMax = (await db.collection('photo').where(qf_album).count()).total;
    this.jsData.album_raw = [];
    await this.loadMoreAlbum();
    this.setData({
      albumMax: this.jsData.albumMax
    });
  },

  async loadMorePhotos() {
    var cat = this.data.cat;
    // 给这个参数是防止异步
    if (this.data.cat.photo.length >= this.jsData.photoMax) {
      return false;
    }
    const qf = {
      cat_id: this.jsData.cat_id,
      verified: true,
      best: true,
      photo_id: no_heic
    };
    const step = this.jsData.page_settings.photoStep;
    const now = cat.photo.length;

    // wx.showLoading({
    //   title: '加载中...',
    //   mask: true
    // })

    const db = await cloud.databaseAsync();
    let res = await db.collection('photo').where(qf).orderBy('mdate', 'desc').skip(now).limit(step).get();
    console.log("[loadMorePhotos] -", res);
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
    const preload = this.jsData.page_settings.galleryPreload;
    this.jsData.whichGallery = e.currentTarget.dataset.kind;
    if (this.jsData.whichGallery == 'best') {
      if (this.data.cat.photo.length - this.currentImg <= preload) await this.loadMorePhotos(); //preload
      var photos = this.data.cat.photo;
    } else if (this.jsData.whichGallery == 'album') {
      if (this.jsData.album_raw.length - this.currentImg <= preload) await this.loadMoreAlbum(); // preload
      var photos = this.jsData.album_raw;
    }

    this.setData({
      showGallery: true,
      galleryPhotos: photos,
      currentImg: this.currentImg,
    });
    wx.hideLoading();
  },

  async bindGalleryChange(e) {
    const index = e.detail.current;
    this.currentImg = index; // 这里得记一下，保存的时候需要
    // preload逻辑
    const preload = this.jsData.page_settings.galleryPreload;
    const photo_count = this.data.galleryPhotos.length;
    if (this.jsData.whichGallery == 'best' && photo_count - index <= preload && photo_count < this.jsData.photoMax) {
      console.log("[bindGalleryChange] - 加载更多精选图");
      await this.loadMorePhotos(); //preload

      var photos = this.data.cat.photo;
    } else if (this.jsData.whichGallery == 'album' && photo_count - index <= preload && photo_count < this.jsData.albumMax) { //album
      await this.loadMoreAlbum(); // preload
      var photos = this.jsData.album_raw;
    } else {
      return;
    }

    this.setData({
      galleryPhotos: photos,
    });
  },

  bindImageLoaded(e) {
    // wx.hideLoading();
  },

  // 下面开始加载相册咯
  // 相册和上面的photo不同的地方在于，有没有best=true这个条件
  // 而且相册的东西还要再处理一下，分开拍摄年月
  async loadMoreAlbum() {
    if (this.jsData.loadingAlbum) {
      return false;
    }

    if (this.jsData.album_raw.length >= this.jsData.albumMax) {
      this.setData({
        bottomText: config.text.detail_cat.bottom_text_end
      })
      return false;
    }
    const qf = {
      cat_id: this.jsData.cat_id,
      verified: true,
      photo_id: no_heic
    };
    const step = this.jsData.page_settings.albumStep;
    const now = this.jsData.album_raw.length;

    const db = await cloud.databaseAsync();

    this.jsData.loadingAlbum = true;
    const orderItem = photoOrder[this.data.photoOrderSelected];

    let res;
    if (orderItem.name == "最早收录") {
      res = await db.collection('photo').where(qf).orderBy(orderItem.key, orderItem.order).skip(now).limit(step).get();
    } else {
      res = await db.collection('photo').where(qf).orderBy(orderItem.key, orderItem.order).orderBy('mdate', 'desc').skip(now).limit(step).get();
    }

    const offset = this.jsData.album_raw.length;
    for (let i = 0; i < res.data.length; ++i) {
      res.data[i].index = offset + i; // 把index加上，gallery预览要用到
    }
    this.jsData.album_raw = this.jsData.album_raw.concat(res.data);
    this.updateAlbum();
  },

  updateAlbum() {
    // 为了页面显示，要把这个结构处理一下
    // 先按日期分类，分为拍摄日期、上传日期
    var orderIdx = this.data.photoOrderSelected;
    var orderKey = photoOrder[orderIdx].key;
    var group = {};
    for (const pic of this.jsData.album_raw) {
      var date;
      if (orderKey == 'shooting_date') {
        date = pic.shooting_date;
      } else if (orderKey == 'mdate') {
        date = formatDate(pic.mdate, 'yyyy-MM');
      }
      if (!date) {
        continue;
      }
      if (!(date in group)) {
        group[date] = [];
      }
      group[date].push(pic);
    }
    // 下面整理一下，变成页面能展示的
    var result = [];
    var keys = Object.keys(group);
    var order = photoOrder[orderIdx].order == 'asc' ? 1 : -1;
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
    this.jsData.loadingAlbum = false;
    this.setData({
      album: result
    });
  },

  bindphotoOrderChange(e) {
    var selected = e.detail.value;
    this.setData({
      photoOrderSelected: selected
    }, function () {
      this.reloadAlbum();
    })
  },

  // 处理主容器滑动时的行为
  bindContainerScroll(e) {
    const rpx2px = this.jsData.heights.rpx2px;
    // 先保证这两个数字拿到了，再开始逻辑
    if (rpx2px && this.jsData.infoHeight) {
      const showHoverHeader = this.data.showHoverHeader;
      // 这个是rpx为单位的
      const to_top = e.detail.scrollTop / rpx2px;
      // 判断是否要显示/隐藏悬浮标题（精选图的高度+信息栏的高度）
      const hover_thred = 470 + (this.jsData.infoHeight / rpx2px);
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
  async bingMpTap(e) {
    // 直接显示
    if (this.data.cat.mpcode) {
      wx.previewImage({
        urls: [this.data.cat.mpcode],
      });
      return false;
    }
    // 如果目前没有，那就先生成一个，再显示
    console.log('[bingMpTap] - 生成mpcode');
    wx.showLoading({
      title: '生成ing...',
    })
    const cat = this.data.cat;
    var res = (await api.getMpCode({
      _id: cat._id,
      scene: 'toC=' + cat._no,
      page: 'pages/genealogy/genealogy',
      width: 500,
    })).result;

    console.log("mpcode:", res);

    res = await cloud.signCosUrl(res);

    wx.hideLoading();
    wx.previewImage({
      urls: [res],
    });
    this.setData({
      'cat.mpcode': res
    });
  },

  showPopularityTip() {
    wx.showToast({
      title: config.text.detail_cat.popularity_tip,
      icon: "none"
    });
  },

  showCommentTip() {
    wx.showToast({
      title: config.text.detail_cat.comment_tip,
      icon: "none"
    });
  },

  toComment() {
    const url = `/pages/genealogy/commentBoard/commentBoard?cat_id=${this.jsData.cat_id}`
    wx.navigateTo({
      url: url,
    })
  },

  likeCountChanged(e) {
    console.log("[likeCountChanged] -", e);
    const current = e.detail.current;
    const like_count = e.detail.like_count;
    if (this.jsData.whichGallery == "best") {
      console.log("[likeCountChanged] - update best photo", e.detail);
      this.setData({
        [`cat.photo[${current}].like_count`]: like_count,
      });
    } else if (this.jsData.whichGallery == "album") {
      this.jsData.album_raw[current].like_count = like_count;
      this.updateAlbum();
    }
  },

  toRelationCat(e) {
    var cat_id = e.currentTarget.dataset.cat_id;
    const url = `/pages/genealogy/detailCat/detailCat?cat_id=${cat_id}`;
    wx.navigateTo({
      url: url,
    });
  },

  toAddRelation() {
    var cat_id = this.data.cat._id;
    const url = `/pages/manage/addRelations/addRelations?cat_id=${cat_id}`;
    wx.navigateTo({
      url: url,
    });
  },

  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);
    if (!user.userInfo) {
      user.userInfo = {};
    }
    this.setData({
      user: user
    });
  },

  // 检查是否配置了徽章
  async checkBadgeDefEmpty() {
    const m = this.jsData.badgeDefMap;
    if (!Object.keys(m).length) {
      return;
    }

    this.setData({ showBadge: true });
  },

  // 更新用户的徽章库存（不需要onload）
  async reloadUserBadge() {
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
      await this.checkBadgeDefEmpty();
    }
    if (!this.data.user) {
      await this.loadUser();
    }
    this.setData({
      userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap, {keepZero: true}),
    });
  },

  // 赠予徽章
  async doGiveBadge() {
    if (this.jsData.badgeGiving) {
      return;
    }
    this.jsData.badgeGiving = true;

    const index = this.data.activeUserBadge;
    const badgeDef = this.data.userBadges[index]._id;
    const res = await api.giveBadge({
      catId: this.data.cat._id,
      badgeDef: badgeDef
    });
    if (res.result.ok) {
      wx.showToast({
        title: '赠予成功',
        icon: "success"
      });
    } else {
      wx.showToast({
        title: '赠予失败',
        icon: "error"
      });
    }

    this.setData({
      activeUserBadge: -1,
    });

    await Promise.all([
      this.reloadUserBadge(),
      this.reloadCatBadge()
    ]);

    this.jsData.badgeGiving = false;
  },

  // 点击赠予徽章
  async toGiveBadge(e) {
    if (this.data.activeUserBadge === -1) {
      return;
    }
    await this.doGiveBadge();
  },

  // 点击获取徽章
  async toGetBadge(e) {
    wx.navigateTo({
      url: '/pages/info/badge/badge',
    });
  },

  // 更新猫的徽章，TODO(zing): 减少调用次数，考虑做个中间表
  async reloadCatBadge() {
    const catId = this.data.cat._id;
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
      await this.checkBadgeDefEmpty();
    }
    let badges = await loadCatBadge(catId);
    badges.sort((a, b) => b.givenTime - a.givenTime);
    let mergedBadges = await mergeAndSortBadges(badges, this.jsData.badgeDefMap);
    this.setData({
      catBadges: mergedBadges,
      detailBadges: badges,
    });
  },

  async bindTapUserBadge(e) {
    let {index} = e.currentTarget.dataset;
    if (this.data.userBadges[index].count === 0) {
      wx.showToast({
        title: '请先获取该徽章~',
        icon: "none"
      });
      return;
    }
    if (this.data.activeUserBadge === index) {
      index = -1;
    }
    this.setData({
      activeUserBadge: index,
    });
  },

  async showGiveBadge() {
    this.setData({
      showGiveBadge: true,
    })
  },

  async hideGiveBadge() {
    this.setData({
      showGiveBadge: false,
    })
  },

  async toBadgeDetail() {
    if (this.data.detailBadges.length === 0) {
      wx.showToast({
        title: '暂无徽章~',
        icon: 'none'
      });
      return;
    }
    // 新开一个页面，用缓存来传值
    wx.setStorageSync('cat-badge-info', {
      catName: this.data.cat.name,
      userOpenid: this.data.user.openid
    });
    wx.setStorageSync('cat-badge-detail', this.data.detailBadges);
    // 跳转
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/badgeDetail/badgeDetail',
    });
  },

  // 展示弹窗
  showBadgeModal(e) {
    const {index} = e.currentTarget.dataset;
    const badge = this.data.catBadges[index];
    const modal = {
      show: true,
      title: "徽章详情",
      name: badge.name,
      img: badge.img,
      desc: badge.desc,
      level: badge.level,
      tip: `共拥有${badge.count}枚`,
    };
    this.setData({modal});
  },
})