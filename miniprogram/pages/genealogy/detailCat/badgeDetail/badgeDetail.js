import { fillUserInfo } from "../../../../utils/user";
import { loadBadgeDefMap } from "../../../../utils/badge";
import { formatDate } from "../../../../utils/utils";

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    let detailBadges = wx.getStorageSync('cat-badge-detail');
    const [badgeDefMap, _] = await Promise.all([
      loadBadgeDefMap(),
      fillUserInfo(detailBadges, "_openid", "userInfo"),
    ]);
    for (let b of detailBadges) {
      b.badgeInfo = badgeDefMap[b.badgeDef];
      b.dispTime = formatDate(new Date(b.givenTime), "yyyy-MM-dd hh:mm:ss")
    }
    this.setData({
      detailBadges
    });
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})