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
    let info = wx.getStorageSync('cat-badge-info');
    let detailBadges = wx.getStorageSync('cat-badge-detail');
    wx.setNavigationBarTitle({
      title: `${info.catName}的徽章口袋`
    })
    const [badgeDefMap, _] = await Promise.all([
      loadBadgeDefMap(),
      fillUserInfo(detailBadges, "_openid", "userInfo"),
    ]);
    for (let b of detailBadges) {
      b.badgeInfo = badgeDefMap[b.badgeDef];
      b.dispTime = formatDate(new Date(b.givenTime), "yyyy-MM-dd hh:mm")
    }
    this.setData({
      detailBadges,
      userOpenid: info.userOpenid
    });

    await this.calcOrder(detailBadges);
  },

  async calcOrder(detailBadges) {
    // 计算排名
    let mergeBadges = {};
    for (const b of detailBadges) {
      if (mergeBadges[b.badgeDef] === undefined) {
        mergeBadges[b.badgeDef] = {
          badgeDef: b.badgeDef,
          badgeInfo: b.badgeInfo,
          count: 0,
        };
      }
      mergeBadges[b.badgeDef].count ++;
    }

    // 计算排序
    let res = Object.values(mergeBadges);
    res = res.sort((a, b) => b.count - a.count);
    for (let i = 0; i < res.length; i++) {
      if (i == 0 || (res[i].count != res[i-1].count)) {
        res[i].order = i + 1;
        continue;
      }
      res[i].order = res[i-1].order;
    }

    this.setData({
      orderBadges: res,
    });
  },
  
  // 不能通过分享进来，因为需要读缓存
})