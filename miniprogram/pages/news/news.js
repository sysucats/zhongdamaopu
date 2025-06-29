// miniprogram/pages/news/news.js
import { sleep } from "../../utils/utils";
import { text as text_cfg, science_imgs } from "../../config";
import { checkAuth } from "../../utils/user";
import { showTab } from "../../utils/page";
import { signCosUrl } from "../../utils/common";
const share_text = text_cfg.app_name + ' - ' + text_cfg.science.share_tip;

const app = getApp();

Page({
  data: {
    text_cfg: text_cfg,
    newsList: [],
    newsList_show: [],
    updateRequest: false,
    auth: false,
    buttons: [{
      id: -1,
      name: '全部',
      checked: true,
      logo: '/pages/public/images/news/all.png'
    }, {
      id: 0,
      name: '领养',
      checked: false,
      logo: '/pages/public/images/news/adopt.png'
    }, {
      id: 1,
      name: '救助',
      checked: false,
      logo: '/pages/public/images/news/help.png'
    }, {
      id: 2,
      name: '活动',
      checked: false,
      logo: '/pages/public/images/news/activity.png'
    }, {
      id: 3,
      name: '其他',
      checked: false,
      logo: '/pages/public/images/news/other.png'
    }],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    var { result } = await app.mpServerless.db.collection('news').find({}, { sort: { date: -1 } });

    // 签名 coverPath 字段
    for (let i = 0; i < result.length; i++) {
      if (result[i].coverPath) {
        result[i].coverPath = await signCosUrl(result[i].coverPath);
      }
    }

    this.setData({
      newsList: result,
      newsList_show: result,
    })
    await checkAuth(this, 2);

    // 科普部分
    this.setSciImgs();
  },
  onShow: function () {
    // 切换自定义tab
    showTab(this);
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
  async getData() {
    var { result } = await app.mpServerless.db.collection('news').find({}, { sort: { date: -1 } });

    // 签名 coverPath 字段
    for (let i = 0; i < result.length; i++) {
      if (result[i].coverPath) {
        result[i].coverPath = await signCosUrl(result[i].coverPath);
      }
    }

    this.setData({
      newsList: result,
    });
    await this.filterNews();

    wx.stopPullDownRefresh();

    await sleep(1000);

    this.setData({
      updateRequest: false,
    });
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
      console.log("[filterNews] -", newsList_show);
    }
  },

  radioButtonTap: function (e) {
    console.log("[radioButtonTap] -", e);
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

  async setSciImgs() {
    const sciImgList = await Promise.all(science_imgs.map(val => signCosUrl(val)));;
    const cacheKey = 'sciImgStorage';
    const dataKey = 'images';

    const fileSystem = wx.getFileSystemManager();
    var cachePathList = wx.getStorageSync(cacheKey);
    try {
      fileSystem.accessSync(cachePathList[0]);
      this.useCacheImg(cacheKey, dataKey);
    } catch (e) {
      this.useCloudImg(sciImgList, dataKey);
      this.cacheCloudImg(cacheKey, sciImgList);
    }
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

  async downloadFile(fileID) {
    return new Promise(function (resolve, reject) {
      wx.downloadFile({
        url: fileID,
        success(res) {
          resolve(res);
        },
        fail: res => reject(res)
      });
    });
  },

  async cacheCloudImg(cacheKey, imgUrlList) { // 下载并缓存封面
    const fileSystem = wx.getFileSystemManager();
    var promiseAll = [];
    var cachePathList = [];

    for (let i = 0; i < imgUrlList.length; i++) {
      promiseAll.push(this.downloadFile(imgUrlList[i]));
    }

    var res = await Promise.all(promiseAll);

    console.log("[cacheCloudImg] -", res);
    for (let i = 0; i < res.length; i++) {
      var savedFilePath = fileSystem.saveFileSync(res[i].tempFilePath);
      cachePathList.push(savedFilePath);
    }
    wx.setStorage({
      key: cacheKey,
      data: cachePathList
    });
  },

  gotoSciDetail(e) {
    const cate = e.currentTarget.dataset.cate;
    wx.navigateTo({
      url: '/pages/news/sciDetail/sciDetail?cate=' + cate,
    });
  },

})