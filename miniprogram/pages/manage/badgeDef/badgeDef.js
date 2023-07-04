import { checkAuth, fillUserInfo } from "../../../user";
import { cloud } from "../../../cloudAccess";
import api from "../../../cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    if (await checkAuth(this, 2)) {
      await this.loadBadgeDefs();
    }
  },


  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 加载所有徽章
  async loadBadgeDefs() {
    const db = await cloud.databaseAsync();
    const badgeCount = (await db.collection("badge_def").count()).total;
    let badgeDefs = [];
    while (badgeDefs.length < badgeCount) {
      const tmp = (await db.collection('badge_def').skip(badgeDefs.length).get()).data;
      badgeDefs = badgeDefs.concat(tmp);
    }
    this.setData({
      badgeDefs: badgeDefs,
    });
  },
})