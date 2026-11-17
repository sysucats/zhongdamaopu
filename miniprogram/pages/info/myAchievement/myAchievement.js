import { getMyAchievements, isNewBadge, markBadgeSeen, materialPillStyle } from "../../../utils/achievement";
import { formatDate } from "../../../utils/utils";

Page({
  data: {
    list: [],
    unlockedCount: 0,
    totalCount: 0,
    goldCount: 0,
    percent: 0,
    showBadgeDetail: false,
    selectedBadge: null,
  },

  openBadge(e) {
    const key = e.currentTarget.dataset.key;
    for (const [index, category] of this.data.list.entries()) {
      const tierIndex = category.tiers.findIndex(item => item.key === key);
      if (tierIndex < 0) continue;
      const tier = category.tiers[tierIndex];
      const update = {
        selectedBadge: { ...tier, name: tier.tierName, unit: category.unit },
        showBadgeDetail: true,
      };
      // 点开详情即算看过，去掉「新」角标
      if (tier.isNew) {
        markBadgeSeen(key);
        update[`list[${index}].tiers[${tierIndex}].isNew`] = false;
      }
      this.setData(update);
      return;
    }
  },

  closeBadge() {
    this.setData({ showBadgeDetail: false, selectedBadge: null });
  },

  async onLoad() {
    wx.showLoading({ title: '加载中...' });
    try {
      const result = await getMyAchievements();
      const list = result.ladders;
      let unlockedCount = 0;
      let goldCount = 0;
      list.forEach((ladder, index) => {
        ladder.showSeries = index === 0 || list[index - 1].series !== ladder.series;
        ladder.tiers.forEach(t => {
          t.unlock_time_text = t.unlock_time ? formatDate(new Date(t.unlock_time), 'yyyy-MM-dd') : '';
          t.isNew = isNewBadge(t);
          if (t.unlocked) unlockedCount++;
        });
        // 当前达到的阶梯位置（0 = 未解锁）
        ladder.currentTier = ladder.tiers.reduce((acc, t) => t.unlocked ? t.tier : acc, 0);
        const currentColor = ladder.currentTier ? ladder.tiers[ladder.currentTier - 1].materialColor : '';
        ladder.currentStyle = ladder.currentTier ? materialPillStyle(currentColor) : '';
        if (ladder.currentTier && ladder.currentTier === ladder.tiers.length) goldCount++;
        const nextCondition = ladder.tiers.find(t => !t.unlocked && t.currentCount !== null && t.currentCount < t.threshold);
        const firstLocked = ladder.tiers.find(t => !t.unlocked);
        ladder.nextCondition = firstLocked
          ? (nextCondition?.desc || (firstLocked.currentCount === null ? firstLocked.desc : '已满足全部条件'))
          : '已点亮全部徽章';
      });
      const totalCount = list.reduce((s, c) => s + c.tiers.length, 0);
      this.setData({
        list: list,
        unlockedCount: unlockedCount,
        totalCount: totalCount,
        goldCount: goldCount,
        percent: totalCount ? Math.round(unlockedCount * 100 / totalCount) : 0,
      });
    } catch (e) {
      console.error('加载成就失败', e);
      wx.hideLoading();
      wx.showToast({ title: '成就加载失败，请稍后重试', icon: 'none' });
      return;
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
