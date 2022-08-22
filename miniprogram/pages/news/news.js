// miniprogram/pages/news/news.js

const utils = require('../../utils.js');
const config = require('../../config.js');
const cloud = require('../../cloudAccess.js').cloud;

const isManager = utils.isManager;
const text_cfg = config.text;
const share_text = text_cfg.app_name + ' - ' + text_cfg.science.share_tip;


Page({
  data: {
    text_cfg: text_cfg,
    newsList: [],
    newsList_show: [],
    updateRequest: false,
    showManager: false,
    buttons: [{
      id: -1,
      name: '全部',
      checked: true,
      logo: '../../images/news/all.png'
    }, {
      id: 0,
      name: '领养',
      checked: false,
      logo: '../../images/news/adopt.png'
    }, {
      id: 1,
      name: '救助',
      checked: false,
      logo: '../../images/news/help.png'
    }, {
      id: 2,
      name: '活动',
      checked: false,
      logo: '../../images/news/activity.png'
    }, {
      id: 3,
      name: '其他',
      checked: false,
      logo: '../../images/news/other.png'
    }],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const that = this;
    const db = cloud.database();
    db.collection('news').orderBy('date', 'desc').get().then(res => {
      that.setData({
        newsList: res.data,
        newsList_show: res.data,
      })
      console.log("News:", res);
    });
    this.checkAuth();

    // 科普部分
    this.setSciImgs();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  onShareTimeline: function () {
    return {
      title: share_text,
      // query: 'cat_id=' + this.data.cat._id
    }
  },



  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.onRefresh();
  },

  // 下拉刷新
  onRefresh() {
    this.getData();
    this.setData({
      updateRequest: true,
    })
  },

  // 重新载入数据库
  getData() {
    const that = this;
    const db = cloud.database();
    db.collection('news').orderBy('date', 'desc').get().then(res => {
      that.setData({
        newsList: res.data,
      });
      that.filterNews();
    });

    wx.stopPullDownRefresh();

    setTimeout(function () {
      that.setData({
        updateRequest: false,
      })
    }, 1000)
  },

  clickNews(e) {
    const news_id = e.currentTarget.dataset.news_id;
    const detail_url = '/pages/news/detailNews/detailNews';
    wx.navigateTo({
      url: detail_url + '?news_id=' + news_id,
    });
  },

  clickScience() {
    wx.navigateTo({
      url: '/pages/science/science'
    });
  },

  clickCreateBtn(e) {
    wx.navigateTo({
      url: '/pages/news/createNews/createNews',
    });
  },

  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          showManager: true
        });
      }
    }, 2)
  },

  filterNews() {
    var button_chosen = "全部";
    for (let i = 0; i < this.data.buttons.length; i++) {
      if (this.data.buttons[i].checked) {
        button_chosen = this.data.buttons[i].name;
      }
    }

    if (button_chosen == "全部") {
      this.setData({
        newsList_show: this.data.newsList,
      })
    } else {
      var newsList = this.data.newsList;
      var newsList_show = [];
      for (let i = 0; i < newsList.length; i++) {
        if (newsList[i].class == button_chosen) {
          newsList_show.push(newsList[i]);
        }
      }
      this.setData({
        newsList_show: newsList_show,
      })
      console.log("Filter for New: ", newsList_show);
    }
  },

  radioButtonTap: function (e) {
    console.log("Radio Button Tap: ", e);
    let id = e.currentTarget.dataset.id;
    for (let i = 0; i < this.data.buttons.length; i++) {
      if (this.data.buttons[i].id == id) {
        this.data.buttons[i].checked = true;
      } else {
        this.data.buttons[i].checked = false;
      }
    }
    this.setData({
      buttons: this.data.buttons
    });
    this.filterNews();
  },

  // 科普轮播图相关代码

  setSciImgs() {
    const sciImgList = config.science_imgs;
    const cacheKey = 'sciImgStorage';
    const dataKey = 'images';

    const fileSystem = wx.getFileSystemManager();
    const that = this;

    var cachePathList = wx.getStorageSync(cacheKey);

    fileSystem.access({
      path: cachePathList[0],
      success: res => {
        that.useCacheImg(cacheKey, dataKey);
      },
      fail: res => {
        // console.log("accessFileFail",res);
        that.useCloudImg(sciImgList, dataKey);
        that.cacheCloudImg(cacheKey, sciImgList);
      }
    });
  },

  useCacheImg(cacheKey, dataKey) {
    var coverImgList = wx.getStorageSync(cacheKey);
    this.setData({
      [dataKey]: coverImgList
    })
  },
  useCloudImg(onlineImgs, dataKey) {
    this.setData({
      [dataKey]: onlineImgs
    })
  },

  cacheCloudImg(cacheKey, imgUrlList) { // 下载并缓存封面
    const fileSystem = wx.getFileSystemManager();
    var promiseAll = new Array(imgUrlList.length);
    var cachePathList = [];

    for (let i = 0; i < imgUrlList.length; i++) {
      promiseAll[i] = new Promise(function (resolve, reject) {
        cloud.downloadFile({
          fileID: imgUrlList[i],
          success: function (res) {
            var savedFilePath = fileSystem.saveFileSync(res.tempFilePath);
            cachePathList.push(savedFilePath);
            resolve(res);
          },
          fail: res => reject(res)
        })
      });
    }

    Promise.all(promiseAll).then(res => {
      // console.log("proAll:",res);
      wx.setStorage({
        key: cacheKey,
        data: cachePathList
      });
    })
  },

  gotoSciDetail(e) {
    const cate = e.currentTarget.dataset.cate;
    wx.navigateTo({
      url: '/pages/news/sciDetail/sciDetail?cate=' + cate + '&coverImgList=' + this.data.images,
    });
  },

})