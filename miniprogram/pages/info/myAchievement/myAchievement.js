import { getMyAchievements, isNewBadge, markBadgeSeen, materialPillStyle } from "../../../utils/achievement";
import { formatDate } from "../../../utils/utils";

// 阶梯：系列标题 + 同一统计项按门槛排列，右上角显示当前达到的档位
function decorateLadder(ladder, showSeries) {
  ladder.showSeries = showSeries;
  ladder.tiers.forEach(t => {
    t.subText = `${t.threshold}${t.unit}`;
    t.statusText = t.unlocked ? t.unlock_time_text : (t.currentCount !== null && t.currentCount >= t.threshold ? '已达条件' : '未解锁');
  });
  // 当前达到的阶梯位置（0 = 未解锁）
  ladder.currentTier = ladder.tiers.reduce((acc, t) => t.unlocked ? t.tier : acc, 0);
  const current = ladder.currentTier ? ladder.tiers[ladder.currentTier - 1] : null;
  ladder.pillText = current ? current.tierName : '';
  ladder.currentStyle = current ? materialPillStyle(current.materialColor) : '';
  const nextCondition = ladder.tiers.find(t => !t.unlocked && t.currentCount !== null && t.currentCount < t.threshold);
  const firstLocked = ladder.tiers.find(t => !t.unlocked);
  ladder.nextCondition = firstLocked
    ? (nextCondition?.desc || (firstLocked.currentCount === null ? firstLocked.desc : '已满足全部条件'))
    : '已点亮全部徽章';
}

// 平铺：整个系列一张卡，每枚显示日期和时间状态，右上角显示点亮数
function decorateGrid(ladder) {
  ladder.showSeries = false;
  ladder.tiers.forEach(t => {
    t.subText = t.windowText;
    // 进行中的用角标提示（剩 N 天 / 今天截止），其余状态写在下方
    const open = !t.unlocked && t.windowState === 'open';
    t.cornerText = open ? t.windowStateText : '';
    t.statusText = t.unlocked ? t.unlock_time_text : (open ? '' : t.windowStateText);
  });
  const unlocked = ladder.tiers.filter(t => t.unlocked).length;
  ladder.pillText = `${unlocked}/${ladder.tiers.length}`;
  ladder.currentStyle = '';
  const open = ladder.tiers.filter(t => !t.unlocked && t.windowState === 'open');
  const upcoming = ladder.tiers.find(t => t.windowState === 'upcoming');
  if (unlocked === ladder.tiers.length) ladder.nextCondition = '已点亮全部徽章';
  else if (open.length === 1) ladder.nextCondition = `进行中：${open[0].tierName} · ${open[0].desc}`;
  else if (open.length) ladder.nextCondition = `进行中：${open.map(t => t.tierName).join('、')}`;
  else if (upcoming) ladder.nextCondition = `下一枚：${upcoming.tierName}，${upcoming.windowStateText}`;
  else ladder.nextCondition = '本系列已结束';
}

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
        selectedBadge: { ...tier, name: tier.tierName, unit: tier.unit || category.unit },
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
        ladder.tiers.forEach(t => {
          t.unlock_time_text = t.unlock_time ? formatDate(new Date(t.unlock_time), 'yyyy-MM-dd') : '';
          t.isNew = isNewBadge(t);
          if (t.unlocked) unlockedCount++;
        });
        // 最高级：阶梯点亮最高一档；平铺点亮全部
        if (ladder.layout === 'grid' ? ladder.tiers.every(t => t.unlocked) : ladder.tiers[ladder.tiers.length - 1]?.unlocked) goldCount++;
        if (ladder.layout === 'grid') decorateGrid(ladder);
        else decorateLadder(ladder, index === 0 || list[index - 1].series !== ladder.series);
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
