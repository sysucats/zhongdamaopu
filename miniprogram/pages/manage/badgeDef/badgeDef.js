import { checkAuth } from "../../../utils/user";
import { signCosUrl } from "../../../utils/common";
const app = getApp();
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
    await checkAuth(this, 2)
  },

  async onShow() {
    await this.loadBadgeDefs();
  },

  async loadBadgeDefs() {
    const { result: badgeDefCount } = await app.mpServerless.db.collection('badge_def').count({});
    let badgeDefs = [];
    while (badgeDefs.length < badgeDefCount) {
      const { result: tmp } = await app.mpServerless.db.collection('badge_def').find({}, { skip: badgeDefs.length });
      badgeDefs = badgeDefs.concat(tmp);
    }

    // 获取现存数量
    let getCountTask = [];
    for (const b of badgeDefs) {
      const { result: count } = await app.mpServerless.db.collection('badge').count({ badgeDef: b._id });
      getCountTask.push(count);
    }
    let badgeCount = await Promise.all(getCountTask);

    // 签名 img 字段
    for (let i = 0; i < badgeDefs.length; i++) {
      // 记录数量
      badgeDefs[i].count = badgeCount[i].total;

      // 签名 img
      if (badgeDefs[i].img) {
        badgeDefs[i].img = await signCosUrl(badgeDefs[i].img);
      }
    }

    this.setData({
      badgeDefs: badgeDefs,
    });
  },

  // 修改
  onEdit(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/manage/badgeDef/addBadgeDef/addBadgeDef?id=${id}`,
    });
  },

  // 徽章兑换码
  onBadgeCode() {
    wx.navigateTo({
      url: '/pages/manage/badgeCode/badgeCode',
    });
  },
})