import { checkAuth, shareTo, getCurrentPath, formatDate, sleep } from "../../../utils";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    news_id: 0,
    news: 0,
    auth: false,
    updateRequest: false,
    err: false,
    photos_path: [],
    cover_path: "",
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.setData({
      news_id: options.news_id
    })
    await Promise.all([
      this.loadNews(),
      checkAuth(this, 2)
    ]);
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.onRefresh();
  },

  // 下拉刷新
  onRefresh() {
    this.setData({
      updateRequest: true
    })
    this.loadNews();
    const that = this;
    setTimeout(function () {
      that.setData({
        updateRequest: false
      })
    }, 1000)
    wx.stopPullDownRefresh();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    const share_text = `${this.data.news.title}`;
    console.log(shareTo(share_text, path))
    return shareTo(share_text, path);
  },

  async loadNews() {
    const db = wx.cloud.database();
    var res = await db.collection('news').doc(this.data.news_id).get();
    console.log("News Detail:", res);
    if (!res.data) {
      this.setData({
        err: true,
      })
      return;
    }

    var news = res.data;
    news.ddate = formatDate(news.date, "yyyy年MM月dd日 hh:mm:ss");
    if (news.dateLastModify) {
      news.ddateLastModify = formatDate(new Date(news.dateLastModify), "yyyy年MM月dd日 hh:mm:ss");
    }
    this.setData({
      news: news,
      photos_path: news.photosPath,
      cover_path: news.coverPath,
    })
  },

  previewImg: function (event) {
    const that = this;
    console.log("Preveiw Image: ", event);
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
    var res = await wx.cloud.callFunction({
      name: "newsOp",
      data: {
        type: "delete",
        item_id: item_id,
      }
    })
    
    console.log(res);
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
    if (this.data.auth == false) {
      return;
    }
    
    var modalRes = wx.showModal({
      content: '确定要删除吗？'
    });

    if (modalRes.confirm) {
      await this._doRemove(this.data.news_id);
    }
  },
})