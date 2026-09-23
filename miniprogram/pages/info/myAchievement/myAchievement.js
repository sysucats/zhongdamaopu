import { getMyAchievements } from "../../../utils/achievement";
import { formatDate } from "../../../utils/utils";

Page({
  data: {
    list: [],
    unlockedCount: 0,
    totalCount: 0,
    goldCount: 0,
  },

  async onLoad() {
    wx.showLoading({ title: '加载中...' });
    try {
      const list = await getMyAchievements();
      let unlockedCount = 0;
      let goldCount = 0;
      list.forEach(cat => {
        cat.tiers.forEach(t => {
          t.unlock_time_text = t.unlock_time ? formatDate(new Date(t.unlock_time), 'yyyy-MM-dd') : '';
          if (t.unlocked) {
            unlockedCount++;
            if (t.tier === 3) {
              goldCount++;
            }
          }
        });
        // 当前达到的级别（0=未解锁，1铜 2银 3金）
        cat.currentTier = cat.tiers.reduce((acc, t) => t.unlocked ? t.tier : acc, 0);
      });
      this.setData({
        list: list,
        unlockedCount: unlockedCount,
        totalCount: list.reduce((s, c) => s + c.tiers.length, 0),
        goldCount: goldCount,
      });
    } catch (e) {
      console.error('加载成就失败', e);
    }
    wx.hideLoading();
  },

  onShareAppMessage() {
    return {
      title: '快来看看我解锁的猫咪成就~',
      path: '/pages/info/myAchievement/myAchievement',
    };
  },
})
