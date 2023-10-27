import {
  shareTo,
  getCurrentPath,
  formatDate,
  sleep
} from "../../../utils/utils";
import {
  isManagerAsync, getPageUserInfo, fillUserInfo, checkCanComment, toSetUserInfo
} from "../../../utils/user";
import {
  cloud
} from "../../../utils/cloudAccess";
import { getCatCommentCount } from "../../../comment";
import config from "../../../config";
import api from "../../../utils/cloudApi";

// 常用的对象
const db = cloud.database();
const coll_comment = db.collection('comment');

// 发送锁
var sendLock = false;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    news_id: 0,    // // 用新闻id代替cat id
    news: 0,
    updateRequest: false,
    err: false,
    photos_path: [],
    cover_path: "",
    showManager: false,

    // 评论部分
    show_fix_header: false,
    news_msg: {},
    comments: [],
    comment_count: 0,
    keyboard_height: 0,
    text_cfg: config.text,
    is_manager: false,

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.setData({
      news_id: options.news_id
    })

    // 检查评论设置
    if (!await checkCanComment()) {
      wx.showToast({
        title: '已暂时关闭..',
        duration: 10000
      });
      return false;
    }
    this.setData({
      canComment: true
    })

    // 启动加载
    await Promise.all([
      this.loadNews(),
      this.loadMoreComment(),
    ]);

    const res = await isManagerAsync(3);
    this.setData({
      showManager: res
    })

    // 是否为管理员lv.1
    var manager = await isManagerAsync(1);
    if (manager) {
      this.setData({
        is_manager: true
      })
    } else {
      console.log("not a manager");
    }
  },

  /**
 * 生命周期函数--监听页面显示
 */
  onShow: async function () {
    await getPageUserInfo(this);
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
        const db = cloud.database();
        var res =  await db.collection('news').doc(that.data.news_id).get();
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
      if (this.data.auth == false) {
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
