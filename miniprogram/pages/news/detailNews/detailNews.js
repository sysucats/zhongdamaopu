import {
  shareTo,
  getCurrentPath,
  formatDate,
  sleep
} from "../../../utils/utils";
import {
  isManagerAsync
} from "../../../utils/user";
import {
  cloud
} from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";


Page({

  /**
   * 页面的初始数据
   */
  data: {
    news_id: 0,
    news: 0,
    updateRequest: false,
    err: false,
    photos_path: [],
    cover_path: "",
    showManager: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.setData({
      news_id: options.news_id
    })
    await this.loadNews();

    const res = await isManagerAsync(3);
    this.setData({
      showManager: res
    })

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const share_text = `${this.data.news.title}`;
    console.log("[onShareAppMessage] -", shareTo(share_text, path))
    return shareTo(share_text, path);
  },

  async loadNews() {
    const that = this;
    const db = await cloud.databaseAsync();
    var res = await db.collection('news').doc(that.data.news_id).get();
    console.log("[loadNews] - NewsDetail:", res);
    if (!res.data) {
      that.setData({
        err: true,
      })
      return;
    }

    var news = res.data;
    news.ddate = formatDate(new Date(news.date), "yyyy年MM月dd日 hh:mm:ss");
    if (news.dateLastModify) {
      news.ddateLastModify = formatDate(new Date(news.dateLastModify), "yyyy年MM月dd日 hh:mm:ss");
    }
    that.setData({
      news: news,
      photos_path: news.photosPath,
      cover_path: news.coverPath,
    })
  },

  previewImg: function (event) {
    const that = this;
    console.log("[previewImg] -", event);
    wx.previewImage({
      current: that.data.photos_path[event.currentTarget.dataset.index],
      urls: that.data.photos_path
    })
  },


  modifyNews() {
    const detail_url = '/pages/news/modifyNews/modifyNews';
    wx.navigateTo({
      url: detail_url + '?news_id=' + this.data.news_id,
    });
  },

  async _doRemove(item_id) {
    var res = (await api.curdOp({
      operation: "remove",
      collection: "news",
      item_id: item_id
    })).result;

    console.log("curdOp(remove) res:", res);
    if (!res) {
      wx.showToast({
        icon: 'none',
        title: '删除失败',
      });
      return
    }
    await sleep(1000);
    wx.navigateBack();
  },

  async removeNews() {
    if (this.data.showManager == false) {
      return;
    }

    var modalRes = await wx.showModal({
      content: '确定要删除吗？'
    });

    if (modalRes.confirm) {
      await this._doRemove(this.data.news_id);
    }
  },
})