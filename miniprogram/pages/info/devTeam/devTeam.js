import { text as text_cfg } from "../../../config";

const share_text = text_cfg.app_name + ' - ' + text_cfg.info.share_tip;

Page({
  /**
   * 页面的初始数据
   */
  data: {
    text_cfg: text_cfg,
    github_link: "https://github.com/sysucats/zhongdamaopu",
    update_log: [{
      version: "v1.1.10",
      content: [
        "神针猫谱正式版上线",
        "成就展示支持自选，可全部取消展示",
        "个人主页数据看板样式优化",
        "徽章收集榜、拍照月榜改为每日0点更新",
        "修复科普轮播图不显示、详情页标签错位",
        "移除喵ID二维码分享功能",
      ],
      time: "2026/9/18"
    }, {
      version: "v1.1.0",
      content: [
        "喵友圈可以点赞、留言互动啦",
        "照片新增评论区，可以给喜欢的照片留言讨论",
        "喵地图新增猫咪常出没地点标记",
        "新增成就系统：铜银金三级，互动即可升级",
        "个人主页可展示3个成就，榜单新增成就排行",
      ],
      time: "2026/9/12"
    }, {
      version: "v1.0.0",
      content: [
        "内测版上线",
      ],
      time: "2026/9/11"
    }]

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

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
    return {
      title: share_text
    }
  },

  copyOpenSourceLink: function () {
    wx.setClipboardData({
      data: this.data.github_link,
    });
  }
})