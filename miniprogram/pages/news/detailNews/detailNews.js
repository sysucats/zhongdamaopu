import { shareTo, getCurrentPath, formatDate, sleep } from "../../../utils";
import { checkAuth, isManagerAsync, getPageUserInfo, fillUserInfo, checkCanComment, toSetUserInfo } from "../../../user";
import { cloud } from "../../../cloudAccess";
import { getCatCommentCount } from "../../../comment";
import config from "../../../config";
import api from "../../../cloudApi";

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
    auth: false,
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

    var comment_count = await getCatCommentCount(this.data.news_id);
    this.setData({
      comment_count: comment_count
    })

  },

  // 加载更多评论
  async loadMoreComment() {
    const _ = db.command;
    var comments = this.data.comments;
    var qf = {
      deleted: _.neq(true),
      cat_id: this.data.news_id,      // 用新闻id代替cat id
    };
    var res = await coll_comment.where(qf).orderBy("create_date", "desc")
      .skip(comments.length).limit(10).get();
    console.log(res);

    // 填充userInfo
    await fillUserInfo(res.data, "user_openid", "userInfo");
    for (var item of res.data) {
      item.datetime = formatDate(new Date(item.create_date), "yyyy-MM-dd hh:mm:ss")
      comments.push(item);
    }

    this.setData({
      comments: comments
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

  // 授权个人信息
  async getUInfo() {
    await toSetUserInfo();
  },

  commentFocus(e) {
    this.setData({
      keyboard_height: e.detail.height || 0,
      input_focus: true,
    })
  },

  commentBlur() {
    this.setData({
      keyboard_height: 0,
      input_focus: false,
    })
  },

  commentInput(e) {
    this.setData({
      comment_input: e.detail.value
    });
  },

  // 发送留言
  sendComment() {
    // 发送中
    if (sendLock) {
      console.log("locking...");
      return false;
    }
    
    const content = this.data.comment_input;

    // 空的就不用留言了
    if (!content || content.length == 1) {
      wx.showModal({
        title: '留言不能为空~',
      });
      return false;
    }
    
    sendLock = true;
    wx.showLoading({
      title: '发送中...',
    });
    // 实际发送
    this.doSendComment();
    this.doSendCommentEnd();
  },

  async doSendComment() {
    const content = this.data.comment_input;

    // 判断是否可以留言
    const user = this.data.user;
    if (user.cantComment) {
      wx.showModal({
        title: "无法留言",
        content: config.text.comment_board.ban_tip,
        showCancel: false,
      })
      return false;
    }
    
    // 插入留言
    var item = {
      content: content,
      user_openid: user.openid,
      cat_id: this.data.news_id,
    };

    const checkRes = await api.contentSafeCheck(content, user.userInfo.nickName);
    if (!checkRes) {
      // 没有检测出问题
      await this.addComment(item, user);
      return
    }
    
    wx.showModal(checkRes);
    return false;
  },

  doSendCommentEnd() {
    wx.hideLoading();
    sendLock = false;
  },

  async addComment(item, user) {
    try {
      var res = (await api.curdOp({
        operation: "add",
        collection: "comment",
        data: item
      })).result;
      
      console.log("curdOp(add-Comment) result): ", res, user);
      // 插入最新留言 + 清空输入框
      console.log(item);
      item.userInfo = user.userInfo;
      item.datetime = formatDate(new Date(), "yyyy-MM-dd hh:mm:ss")
      var comments = this.data.comments;
      comments.unshift(item);
      
      // 获取总数
      var comment_count = await getCatCommentCount(this.data.news_id, {nocache: true});
      this.setData({
        comment_input: "",
        comments: comments,
        comment_count: comment_count,
      });

      // 显示success toast
      wx.showToast({
        title: '留言成功~',
      });
    } catch {
      wx.showModal({
        title: "留言失败",
        showCancel: false,
      })
      console.error(res);
    }
  },

  async deleteComment(e) {
    const index = e.currentTarget.dataset.index;
    const item = e.currentTarget.dataset.item;
    const comment_id = item._id;
    const username = item.userInfo.nickName;
    // 弹窗提示一下
    var res = await wx.showModal({
      title: '提示',
      content: `确定删除\"${username}\"的留言？`
    });
    
    if (!res.confirm) {
      return false;
    }

    await api.curdOp({
      operation: "remove",
      collection: "comment",
      item_id: comment_id
    });
    
    wx.showToast({
      title: '删除成功',
    });
    var comments = this.data.comments;
    comments.splice(index, 1);
    this.setData({
      comments: comments,
    })
  }
})
