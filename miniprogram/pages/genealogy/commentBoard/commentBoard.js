import { formatDate, contentSafeCheck } from "../../../utils";
import config from "../../../config";
import { getPageUserInfo, getUserInfo, checkCanComment, isManagerAsync, toSetUserInfo } from "../../../user";
import { getAvatar } from "../../../cat";
import { getCatCommentCount } from "../../../comment";
import { cloud } from "../../../cloudAccess";

var cat_id;

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
    show_fix_header: false,
    cat: {},
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
    cat_id = options.cat_id;
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
  onUnload: function () {

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
      title: `${cat_name}的留言板 - ${config.text.app_name}`,
      imageUrl: cat_avatar,
    }
  },

  onShareTimeline: function () {
    return this.onShareAppMessage();
  },

  bindCommentScroll(e) {
    const to_top = e.detail.scrollTop;
    const show_fix_header = this.data.show_fix_header;

    const should_show = to_top > 5? true: false;
    if (should_show != show_fix_header) {
      this.setData({
        show_fix_header: should_show
      });
    }
  },
  
  async loadCat() {
    const db = cloud.database();
    var cat = (await db.collection('cat').doc(cat_id).get()).data;
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
  async getUInfo() {
    await toSetUserInfo();
  },

  // 发送留言
  sendComment() {
    // 发送中
    if (sendLock) {
      return false;
    }
    
    const content = this.data.comment_input;

    // 空的就不用留言了
    if (!content || content.length == 1) {
      return false;
    }
    
    sendLock = true;
    wx.showLoading({
      title: '发送中...',
    });
    // 实际发送
    this.doSendComment();
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
      this.doSendCommentEnd();
      return false;
    }
    
    // 插入留言
    const create_date = new Date();
    var item = {
      content: content,
      user_openid: user.openid,
      create_date: {
        "$date": create_date.toISOString()
      },
      cat_id: cat_id,
    };

    const checkRes = await contentSafeCheck(content, user.userInfo.nickName);
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
    var res = await cloud.callFunction({
      name: "curdOp", 
      data: {
        operation: "add",
        collection: "comment",
        data: item
      }
    })
    
    if(res.ok){
      console.log("curdOp(add-Comment) result): ", res, user);
      // 插入最新留言 + 清空输入框
      console.log(item);
      item.userInfo = user.userInfo;
      item.datetime = formatDate(new Date(item.create_date["$date"]), "yyyy-MM-dd hh:mm:ss")
      var comments = this.data.comments;
      comments.unshift(item);
      this.setData({
        comment_input: "",
        comments: comments,
        comment_count: this.data.comment_count + 1,
      });

      // 显示success toast
      this.doSendCommentEnd();
      wx.showToast({
        title: '留言成功~',
      });
    }
    else{
      wx.showModal({
        title: "留言失败",
        content: "请开发者检查“comment”云数据库是否创建，权限是否设置为“双true”",
        showCancel: false,
      })
      console.error(res);
      this.doSendCommentEnd();
    }
    
  },

  // 加载更多留言
  // TODO(zing): 支持排序方式修改
  async loadMoreComment() {
    const _ = db.command;
    var comments = this.data.comments;
    var qf = {
      deleted: _.neq(true),
      cat_id: cat_id
    };
    var res = await coll_comment.where(qf).orderBy("create_date", "desc")
                  .skip(comments.length).limit(10).get();

    for (var item of res.data) {
      const openid = item.user_openid;
      var res = await getUserInfo(openid);
      if (res) {
        item.userInfo = res.userInfo;
      }
      item.datetime = formatDate(item.create_date, "yyyy-MM-dd hh:mm:ss")
      comments.push(item);
    }

    this.setData({
      comments: comments
    });

  },

  deleteComment(e) {
    const that = this;
    const index = e.currentTarget.dataset.index;
    const item = e.currentTarget.dataset.item;
    const comment_id = item._id;
    const username = item.userInfo.nickName;
    // 弹窗提示一下
    wx.showModal({
      title: '提示',
      content: `确定删除\"${username}\"的留言？`,
      success (res) {
        if (res.confirm) {
          cloud.callFunction({
            name: "curdOp",
            data: {
              permissionLevel: 1,
              operation: "remove",
              collection: "comment",
              item_id: comment_id
            },
            success: () => {
              wx.showToast({
                title: '删除成功',
              });
              var comments = that.data.comments;
              comments.splice(index, 1);
              that.setData({
                comments: comments,
              })
            }
          });
        }
      }
    })
  }
})