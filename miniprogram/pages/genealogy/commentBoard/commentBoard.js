import {
  formatDate,
  randomInt
} from "../../../utils/utils";
import config from "../../../config";
import {
  getPageUserInfo,
  fillUserInfo,
  checkCanComment,
  isManagerAsync
} from "../../../utils/user";
import {
  getAvatar
} from "../../../utils/cat";
import {
  getCatCommentCount
} from "../../../utils/comment";
import {
  requestNotice,
} from "../../../utils/msg";
import api from "../../../utils/cloudApi";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    show_fix_header: false,
    cat: {},
    comments: [],
    comment_count: 0,
    keyboard_height: 0,
    text_cfg: config.text,
    is_manager: false,
    is_owner: false,

    paper_colors: ['white', 'yellow', 'green', 'pink'],
    paper_color_select: 0,
  },

  jsData: {
    cat_id: null,
    sendLock: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.jsData.cat_id = options.cat_id;
    this.setData({
      canComment: await checkCanComment()
    })
    // 启动加载
    await Promise.all([
      this.loadCat(),
      this.loadMoreComment(),
    ]);

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
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function () {
    await getPageUserInfo(this);
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: async function () {
    await this.ifSendNotifyVeriftMsg()
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
    const cat = this.data.cat;
    const cat_name = cat.name;
    const cat_avatar = cat.avatar.photo_compressed || cat.avatar.photo_id;
    return {
      title: `${cat_name}的便利贴墙 - ${config.text.app_name}`,
      imageUrl: cat_avatar,
    }
  },

  onShareTimeline: function () {
    return this.onShareAppMessage();
  },

  bindCommentScroll(e) {
    const to_top = e.detail.scrollTop;
    const show_fix_header = this.data.show_fix_header;

    const should_show = to_top > 5 ? true : false;
    if (should_show != show_fix_header) {
      this.setData({
        show_fix_header: should_show
      });
    }
  },

  async loadCat() {
    var cat = (await app.mpServerless.db.collection('cat').findOne({ _id: this.jsData.cat_id })).result;
    console.log(cat);

    // 获取头像
    cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
    console.log(cat.avatar);

    // 获取总数
    var comment_count = await getCatCommentCount(cat._id);
    this.setData({
      cat: cat,
      comment_count: comment_count
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
  closeEdit: function () {
    this.setData({
      showEdit: false
    });
  },

  // 发送便利贴
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
    this.doSendComment();
    this.doSendCommentEnd();
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

    // 插入便利贴
    const { paper_colors, paper_color_select } = this.data;
    var item = {
      content: content,
      user_openid: user.openid,
      cat_id: this.jsData.cat_id,
      paper_color: paper_colors[paper_color_select],
      needVerify: true,
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
    this.jsData.sendLock = false;
  },

  async addComment(item, user) {
    try {
      var res = await api.curdOp({
        operation: "add",
        collection: "comment",
        data: item
      });

      console.log("curdOp(add-Comment) result): ", res, user);
      // 插入最新便利贴 + 清空输入框
      console.log(item);
      item.userInfo = user.userInfo;
      item.datetime = formatDate(new Date(), "yyyy-MM-dd hh:mm:ss")
      var comments = this.data.comments;
      comments.unshift(item);

      // 获取总数
      var comment_count = await getCatCommentCount(item.cat_id, {
        nocache: true
      });
      this.setData({
        comment_input: "",
        comments: comments,
        comment_count: comment_count,
      });

      // 显示success toast
      wx.showToast({
        title: '张贴成功~',
      });
    } catch {
      wx.showModal({
        title: "张贴失败",
        showCancel: false,
      })
      console.error(res);
    }
  },

  // 加载更多便利贴
  // TODO(zing): 支持排序方式修改
  async loadMoreComment() {
    // 常用的对象
    var { comments, loadNoMore } = this.data;

    if (loadNoMore) {
      return;
    }

    var qf = {
      deleted: { $ne: true },
      cat_id: this.jsData.cat_id
    };
    var res = (await app.mpServerless.db.collection('comment').find(qf, { skip: comments.length, sort: { create_date: -1 }, limit: 10 })).result;
    console.log(res);
    if (res.length === 0) {
      this.setData({
        loadNoMore: true
      });
      return;
    }

    // 填充userInfo
    await fillUserInfo(res, "user_openid", "userInfo");
    for (var item of res) {
      item.datetime = formatDate(new Date(item.create_date), "yyyy-MM-dd hh:mm:ss")
      // 便签旋转
      item.rotate = randomInt(-5, 5);
      // 贴纸位置
      item.tape_pos_left = randomInt(20, 520);
      item.tape_rotate = randomInt(-50, +50);
      comments.push(item);
    }

    console.log(comments);
    this.setData({ comments });

  },

  async deleteComment(e) {
    const index = e.currentTarget.dataset.index;
    const item = e.currentTarget.dataset.item;
    const comment_id = item._id;
    const username = item.userInfo?.nickName;
    // 弹窗提示一下
    var res = await wx.showModal({
      title: '提示',
      content: `确定删除\"${username}\"的便利贴？`
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
  },

  async ifSendNotifyVeriftMsg() {
    const subMsgSetting = (await app.mpServerless.db.collection('setting').findOne({ _id: 'subscribeMsg' })).result;
    const triggerNum = subMsgSetting.verifyPhoto.triggerNum;  //几条未审核才触发
    // console.log("triggerN",triggerNum);
    var numUnchkPhotos = (await app.mpServerless.db.collection('comment').count({
      needVerify: true
    })).result;

    if (numUnchkPhotos >= triggerNum) {
      await sendNotifyVertifyNotice(numUnchkPhotos);
      console.log("toSendNVMsg");
    }
  },

  selectPaperColor(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({
      paper_color_select: index
    });
  }
})