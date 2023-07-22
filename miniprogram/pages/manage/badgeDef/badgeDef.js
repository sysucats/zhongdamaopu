import { checkAuth } from "../../../utils/user";
import { cloud } from "../../../utils/cloudAccess";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
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

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 加载所有徽章
  async loadBadgeDefs() {
    const db = await cloud.databaseAsync();
    const badgeDefCount = (await db.collection("badge_def").count()).total;
    let badgeDefs = [];
    while (badgeDefs.length < badgeDefCount) {
      const tmp = (await db.collection('badge_def').skip(badgeDefs.length).get()).data;
      badgeDefs = badgeDefs.concat(tmp);
    }
    // 获取现存数量
    let getCountTask = [];
    for (const b of badgeDefs) {
      getCountTask.push(db.collection("badge").where({badgeDef: b._id}).count());
    }
    let badgeCount = await Promise.all(getCountTask);
    for (let i = 0; i < badgeDefs.length; i++) {
      // 记录数量
      badgeDefs[i].count = badgeCount[i].total;
    }
    this.setData({
      badgeDefs: badgeDefs,
    });
  },

  // 修改
  onEdit(e) {
    const {id} = e.currentTarget.dataset;
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