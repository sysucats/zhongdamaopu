import { checkAuth } from "../../../utils/user";
import { signCosUrl } from "../../../utils/common";
import { levelOrderMap } from "../../../utils/badge";
const app = getApp();
const METRIC_LABELS = { view: '浏览', follow: '关注', photo: '拍照', comment: '便利贴', like: '点赞' };
Page({

  /**
   * 页面的初始数据
   */
  data: {
    activeTab: 'cat',
    materials: [],
    userSeries: [],
    catalogError: '',
    catGroups: [],
    catLoading: false,
    catError: '',
    badgeDefs: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await checkAuth(this, 2);
    if (this.data.auth) {
      this.setData({ canEdit: true });
      await this.loadBadgeDefs();
    }
  },

  async onShow() {
    if (!this.data.auth) return;
    if (this.data.activeTab === 'cat') await this.loadBadgeDefs();
    else await this.loadUserCatalog();
  },

  switchTab(e) {
    const activeTab = e.currentTarget.dataset.tab;
    if (activeTab === this.data.activeTab) return;
    this.setData({ activeTab });
    if (activeTab === 'cat') this.loadBadgeDefs();
    else this.loadUserCatalog();
  },

  async loadUserCatalog() {
    try {
      const response = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'manageAchievementCatalog', action: 'list',
      });
      const result = response.result;
      if (!result?.ok) throw new Error(result?.error || '读取失败');
      const metrics = result.metrics || {};
      const sign = url => /^https:\/\//.test(url || '') ? signCosUrl(url) : url;
      const materials = await Promise.all((result.materials || []).map(async item => ({
        ...item, preview: item.image ? await sign(item.image) : '',
      })));
      const materialName = Object.fromEntries(materials.map(item => [item.key, item.name]));
      const badges = await Promise.all((result.badges || []).map(async badge => ({
        ...badge,
        preview: badge.frontImage ? await sign(badge.frontImage) : '',
        thresholdText: `${badge.rule?.count || 0}${metrics[badge.rule?.metric]?.unit || ''}`,
        statusText: `${badge.status === 'active' ? '上线' : '草稿'} · ${materialName[badge.materialKey] || '无材质'}`,
        needsUpload: !/^https:\/\//.test(badge.frontImage || ''),
      })));
      badges.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.key.localeCompare(b.key));
      const seriesNames = [...new Set(badges.map(item => item.series))];
      this.setData({
        materials,
        userSeries: seriesNames.map(name => {
          const items = badges.filter(item => item.series === name);
          const metricKeys = [...new Set([...Object.keys(metrics), ...items.map(item => item.rule?.metric)])];
          return {
            name,
            count: items.length,
            groups: metricKeys.map(metric => ({
              metric,
              name: METRIC_LABELS[metric] || metrics[metric]?.name || metric,
              items: items.filter(item => item.rule?.metric === metric)
                .sort((a, b) => a.rule.count - b.rule.count || (a.sort || 0) - (b.sort || 0)),
            })).filter(group => group.items.length),
          };
        }),
        catalogError: '',
      });
    } catch (error) {
      this.setData({ catalogError: error.message || '用户徽章目录读取失败' });
    }
  },

  editMaterial(e) {
    const key = e.currentTarget.dataset.key || '';
    wx.navigateTo({ url: `/pages/manage/badgeDef/achievementEditor/achievementEditor?mode=material&key=${key}` });
  },

  addUserAchievement() {
    wx.navigateTo({ url: '/pages/manage/badgeDef/achievementEditor/achievementEditor?mode=badge' });
  },

  editUserBadge(e) {
    const key = e.currentTarget.dataset.key || '';
    if (!key) return;
    wx.navigateTo({ url: `/pages/manage/badgeDef/achievementEditor/achievementEditor?mode=badge&key=${key}` });
  },

  async loadBadgeDefs() {
    if (this.data.catLoading) return;
    this.setData({ catLoading: true, catError: '' });
    try {
      const { result: total } = await app.mpServerless.db.collection('badge_def').count({});
      const rows = [];
      while (rows.length < total) {
        const { result: batch } = await app.mpServerless.db.collection('badge_def').find({}, { skip: rows.length, limit: 100 });
        if (!batch?.length) break;
        rows.push(...batch);
      }
      const badgeDefs = await Promise.all(rows.map(async badge => ({
        ...badge,
        img: badge.img ? await signCosUrl(badge.img) : '',
        count: (await app.mpServerless.db.collection('badge').count({ badgeDef: badge._id })).result || 0,
      })));
      const levels = [...new Set([...Object.keys(levelOrderMap), ...badgeDefs.map(badge => badge.level)])];
      this.setData({
        badgeDefs,
        catGroups: levels.map(level => ({ level, items: badgeDefs.filter(badge => badge.level === level) })).filter(group => group.items.length),
      });
    } catch (error) {
      this.setData({ catError: '猫猫徽章读取失败，请重试' });
    } finally {
      this.setData({ catLoading: false });
    }
  },

  // 修改
  onEdit(e) {
    if (!this.data.canEdit) return;
    const id = e.currentTarget.dataset.id || '';
    wx.navigateTo({
      url: `/pages/manage/badgeDef/addBadgeDef/addBadgeDef${id ? `?id=${encodeURIComponent(id)}` : ''}`,
    });
  },

  // 徽章兑换码
  onBadgeCode() {
    wx.navigateTo({
      url: '/pages/manage/badgeCode/badgeCode',
    });
  },
})
