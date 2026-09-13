import {
  formatDate
} from "../../../utils/utils";
import config from "../../../config";
import {
  getPageUserInfo,
  fillUserInfo,
  checkCanComment,
  isManagerAsync
} from "../../../utils/user";
import {
  getCatItem
} from "../../../utils/cat";
import {
  requestNotice,
} from "../../../utils/msg";
import {
  signCosUrl
} from "../../../utils/common";
import {
  likeCheck,
  likeAdd
} from "../../../utils/inter";
import {
  trackComment
} from "../../../utils/achievement";
import api from "../../../utils/cloudApi";
const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cat: {},
    photo: {},
    comments: [],
    comment_count: 0,
    keyboard_height: 0,
    text_cfg: config.text,
    is_manager: false,
    loadNoMore: false,
    canComment: false,
  },

  jsData: {
    photo_id: null,
    cat_id: null,
    sendLock: false,
    likingLock: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.jsData.photo_id = options.photo_id;
    this.jsData.cat_id = options.cat_id;
    this.setData({
      canComment: await checkCanComment()
    })
    // 启动加载
    await Promise.all([
      this.loadPhoto(),
      this.loadCat(),
      this.loadMoreComment(),
      this.refreshCount(),
    ]);

    // 是否为管理员lv.1
    var manager = await isManagerAsync(1);
    if (manager) {
      this.setData({
        is_manager: true
      })
    }
  },

  onShow: async function () {
    await getPageUserInfo(this);
  },

  // 加载照片本体
  async loadPhoto() {
    var photo = (await app.mpServerless.db.collection('photo').findOne({
      _id: this.jsData.photo_id
    })).result;
    if (!photo) {
      wx.showToast({
        title: '照片不存在或已删除',
        icon: 'none'
      });
      return;
    }
    photo.pic = await signCosUrl(photo.photo_compressed || photo.photo_id);
    photo.pic_prev = await signCosUrl(photo.photo_watermark || photo.photo_id);
    photo.datetime = formatDate(new Date(photo.create_date), "yyyy-MM-dd hh:mm");
    await fillUserInfo([photo], "_openid", "userInfo");
    this.setData({
      photo: photo
    });
  },

  // 加载猫猫信息
  async loadCat() {
    if (!this.jsData.cat_id) {
      return;
    }
    const cat = await getCatItem(this.jsData.cat_id);
    if (cat) {
      this.setData({
        cat: cat
      });
    }
  },

  // 加载更多评论
  async loadMoreComment() {
    var { comments, loadNoMore } = this.data;
    if (loadNoMore) {
      return;
    }

    var qf = {
      deleted: { $ne: true },
      photo_id: this.jsData.photo_id
    };
    var res = (await app.mpServerless.db.collection('comment').find(qf, {
      skip: comments.length,
      sort: { create_date: -1 },
      limit: 10
    })).result;
    if (res.length === 0) {
      this.setData({
        loadNoMore: true
      });
      return;
    }

    // 填充userInfo
    await fillUserInfo(res, "user_openid", "userInfo");

    // 批量查询点赞状态
    try {
      const likedArr = await likeCheck(res.map(x => x._id));
      res.forEach((c, i) => { c.liked = likedArr[i]; });
    } catch (e) {
      console.log('查询点赞状态失败', e);
    }

    for (var item of res) {
      item.datetime = formatDate(new Date(item.create_date), "yyyy-MM-dd hh:mm");
      comments.push(item);
    }
    this.setData({
      comments: comments
    });
  },

  // 刷新评论数
  async refreshCount() {
    const { result } = await app.mpServerless.db.collection('comment').count({
      photo_id: this.jsData.photo_id,
      deleted: { $ne: true }
    });
    this.setData({
      comment_count: result
    });
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

  // 授权个人信息
  getUInfo: function () {
    this.setData({
      showEdit: true
    });
  },

  // 发送评论
  async sendComment() {
    // 发送中
    if (this.jsData.sendLock) {
      console.log("locking...");
      return false;
    }

    const content = this.data.comment_input;

    // 空的就不用发了
    if (!content || content.length == 0) {
      return false;
    }

    this.jsData.sendLock = true;
    // 订阅审核通知
    await requestNotice('verify');
    wx.showLoading({
      title: '发送中...',
    });
    // 实际发送
    await this.doSendComment();
    wx.hideLoading();
    this.jsData.sendLock = false;
  },

  async doSendComment() {
    const content = this.data.comment_input;

    // 判断是否可以发
    const user = this.data.user;
    if (user.cantComment) {
      wx.showModal({
        title: "发送失败",
        content: config.text.comment_board.ban_tip,
        showCancel: false,
      })
      return false;
    }

    // 插入评论
    var item = {
      content: content,
      user_openid: user.openid,
      cat_id: this.jsData.cat_id,
      photo_id: this.jsData.photo_id,
      needVerify: true,
    };

    // 文本安全检测
    const checkRes = await api.contentSafeCheck(content, user.userInfo.nickName);
    if (checkRes) {
      wx.showModal(checkRes);
      return false;
    }

    await this.addComment(item, user);
  },

  async addComment(item, user) {
    try {
      var res = await api.curdOp({
        operation: "add",
        collection: "comment",
        data: item
      });

      // curdOp 失败时不抛异常、只返回错误对象，必须检查 insertedId
      if (!res || !res.insertedId) {
        console.warn('[评论区] 写入云端失败', res);
        wx.showModal({
          title: "评论失败",
          content: "请检查网络后重试~",
          showCancel: false,
        });
        return false;
      }

      // 插入最新评论 + 清空输入框
      item.userInfo = user.userInfo;
      item.datetime = formatDate(new Date(), "yyyy-MM-dd hh:mm")
      var comments = this.data.comments;
      comments.unshift(item);
      this.setData({
        comment_input: "",
        comments: comments,
        comment_count: this.data.comment_count + 1,
      });

      // 显示success toast
      wx.showToast({
        title: '评论成功~',
      });

      // 成就：发评论
      trackComment();
    } catch (e) {
      console.error(e);
      wx.showModal({
        title: "评论失败",
        showCancel: false,
      })
    }
  },

  // 点赞评论
  async likeComment(e) {
    const { index, itemId } = e.currentTarget.dataset;
    if (this.jsData.likingLock) {
      return;
    }
    const item = this.data.comments[index];
    if (!item) {
      return;
    }
    this.jsData.likingLock = true;
    try {
      const ok = await likeAdd(itemId, 'comment');
      if (!ok) {
        wx.showToast({ title: '已经赞过啦', icon: 'none' });
        return;
      }
      this.setData({
        [`comments[${index}].liked`]: true,
        [`comments[${index}].like_count`]: (item.like_count || 0) + 1,
      });
    } catch (err) {
      console.error('点赞失败', err);
      wx.showToast({ title: '点赞失败，稍后再试', icon: 'none' });
    } finally {
      this.jsData.likingLock = false;
    }
  },

  // 删除评论
  async deleteComment(e) {
    const index = e.currentTarget.dataset.index;
    const item = e.currentTarget.dataset.item;
    const comment_id = item._id;
    const username = item.userInfo ? item.userInfo.nickName : '';
    // 弹窗提示一下
    var res = await wx.showModal({
      title: '提示',
      content: `确定删除"${username}"的评论？`
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
      comment_count: Math.max(0, this.data.comment_count - 1),
    })
  },

  // 预览照片大图
  previewPhoto() {
    let url = this.data.photo.pic_prev;
    if (!url) {
      return;
    }
    // EMAS 外链可能含中文目录，previewImage 要求 URL 先编码
    try { url = encodeURI(decodeURI(url)); } catch (err) { url = encodeURI(url); }
    wx.previewImage({
      urls: [url],
      current: url
    });
  },

  // 去看猫猫主页
  toCat() {
    if (!this.jsData.cat_id) {
      return;
    }
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + this.jsData.cat_id,
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    const cat_name = this.data.cat.name || '猫猫';
    return {
      title: `${cat_name}的照片评论区 - ${config.text.app_name}`,
      imageUrl: this.data.photo.pic || '',
    }
  },
})
