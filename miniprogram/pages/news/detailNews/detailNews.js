import {
  shareTo,
  getCurrentPath,
  formatDate,
  sleep
} from "../../../utils/utils";
import {
  isManagerAsync
} from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { signCosUrl } from "../../../utils/common";
import { getAvatar, getCatItem } from "../../../utils/cat";

const app = getApp();
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
    // 关联猫猫
    catName: "",
    catAvatar: "",
    catInitial: "",
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

  /**
   * 用户点击右上角分享到朋友圈（新增）
   */
  onShareTimeline: function () {
    const share_text = `${this.data.news.title}`;
    let imageUrl = '';
    if (this.data.cover_path) {
      imageUrl = this.data.cover_path;
    } else if (this.data.photos_path && this.data.photos_path.length > 0) {
      imageUrl = this.data.photos_path[0];
    }
    // 如果连内容图片都没有，则默认获取当前的app_logo.png
    if (!imageUrl) {
      imageUrl = '/pages/public/images/app_logo.png'; 
    }
    return {
      title: share_text,
      imageUrl: imageUrl
    };
  },

  async loadNews() {
    const that = this;
    var { result } = await app.mpServerless.db.collection('news').findOne({
      _id: this.data.news_id
    })
    console.log("[loadNews] - NewsDetail:", result);
    if (!result) {
      that.setData({
        err: true,
      })
      return;
    }

    var news = result;
    news.ddate = formatDate(new Date(news.date), "yyyy年MM月dd日 hh:mm:ss");
    if (news.dateLastModify) {
      news.ddateLastModify = formatDate(new Date(news.dateLastModify), "yyyy年MM月dd日 hh:mm:ss");
    }
    // 签名 coverPath
    if (news.coverPath) {
      news.coverPath = await signCosUrl(news.coverPath);
    }

    // 签名 photosPath
    const signedPhotosPath = await Promise.all(news.photosPath.map(val => signCosUrl(val)));

    that.setData({
      news: news,
      photos_path: signedPhotosPath,
      cover_path: news.coverPath,
    });

    await that.loadCatInfo(news.cat_id);
  },

  // 关联猫猫：名字 + 随机精选头像
  async loadCatInfo(cat_id) {
    if (!cat_id) {
      this.setData({ catName: "", catAvatar: "", catInitial: "" });
      return;
    }
    let cat = null;
    let avatar = null;
    try {
      [cat, avatar] = await Promise.all([getCatItem(cat_id), getAvatar(cat_id)]);
    } catch (err) {
      console.warn("[loadCatInfo] - 读取关联猫猫失败:", err);
    }
    this.setData({
      catName: cat ? (cat.name || "") : "",
      catAvatar: avatar ? (avatar.photo_compressed || avatar.photo_id) : "",
      catInitial: cat && cat.name ? String(cat.name).slice(0, 1) : "",
    });
  },

  // 点击猫猫头像进入猫咪主页
  clickCat() {
    const cat_id = this.data.news && this.data.news.cat_id;
    if (!cat_id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${cat_id}`,
    });
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
    var res = await api.curdOp({
      operation: "remove",
      collection: "news",
      item_id: item_id
    });

    console.log("curdOp(remove) res:", res);
    if (!res.ok) {
      wx.showToast({
        icon: 'none',
        title: '删除失败',
      });
      return
    } else if (res.ok) {
      wx.showToast({
        title: '删除成功',
        icon: 'success',
        duration: 1000
      });
    }
    await sleep(1000);
    wx.navigateBack();
    setTimeout(wx.startPullDownRefresh, 500);
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