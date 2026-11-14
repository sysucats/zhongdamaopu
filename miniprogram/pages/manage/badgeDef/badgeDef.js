import { checkAuth } from "../../../utils/user";
import { signCosUrl } from "../../../utils/common";
import { levelOrderMap } from "../../../utils/badge";
import { clearAchievementCache } from "../../../utils/achievement";
import { generateUUID } from "../../../utils/utils";
import { watchGeneration, stopGenerationWatch } from "./generationProgress";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    activeTab: 'cat',
    thicknessTicks: Array.from({ length: 11 }, (_, index) => index * 2),
    thicknessMm: .6,
    previewBadge: null,
    savedThicknessMm: .6,
    savingDisplaySettings: false,
    materials: [],
    userSeries: [],
    catalogError: '',
    catGroups: [],
    catLoading: false,
    catError: '',
    badgeDefs: [],
    pendingBadges: [],
    allBadges: [],
    draftCount: 0,
    preparing: false,
    activating: false,
    generation: null,
    prepareSummary: '',
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

  onUnload() { stopGenerationWatch(this); },

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
        assetStatusText: badge.generation?.status === 'running'
          ? `${badge.generation.label} ${badge.generation.step}/${badge.generation.total}`
          : badge.generation?.status === 'failed' ? '素材更新失败'
          : (badge.needsAssets || !badge.backImage || !badge.model3dUrl) ? '素材待更新' : '背面及 3D 已就绪',
        thresholdText: `${badge.rule?.count || 0}${metrics[badge.rule?.metric]?.unit || ''}`,
        statusText: `${badge.status === 'active' ? '上线' : '草稿'} · ${materialName[badge.materialKey] || '无材质'}`,
        needsUpload: !/^https:\/\//.test(badge.frontImage || ''),
      })));
      badges.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.key.localeCompare(b.key));
      const seriesNames = [...new Set(badges.map(item => item.series))];
      const preview = badges.find(badge => badge.frontImage && badge.backImage && badge.model3dUrl && !badge.needsAssets && badge.generation?.status !== 'failed');
      const previewBadge = preview ? {
        ...preview,
        engravingModels: badges.filter(badge => badge.series === preview.series && badge.rule?.metric === preview.rule?.metric)
          .map(badge => badge.model3dUrl).filter(Boolean),
      } : null;
      this.setData({
        materials,
        previewBadge,
        thicknessMm: result.displaySettings?.thicknessMm ?? .6,
        savedThicknessMm: result.displaySettings?.thicknessMm ?? .6,
        pendingBadges: badges.filter(badge => badge.needsAssets || !badge.model3dUrl || !badge.backImage || !badge.serialReady).map(badge => ({ key: badge.key, name: badge.name })),
        allBadges: badges.map(badge => ({ key: badge.key, name: badge.name, status: badge.status })),
        draftCount: badges.filter(badge => badge.status !== 'active').length,
        userSeries: seriesNames.map(name => {
          const items = badges.filter(item => item.series === name);
          const metricKeys = [...new Set([...Object.keys(metrics), ...items.map(item => item.rule?.metric)])];
          return {
            name,
            count: items.length,
            groups: metricKeys.map(metric => ({
              metric,
              name: metrics[metric]?.label || metrics[metric]?.name || metric,
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

  onThicknessTouchStart(e) {
    if (this.data.savingDisplaySettings || !e.touches?.length) return;
    const gesture = { clientX: e.touches[0].clientX, active: true };
    this._thicknessGesture = gesture;
    this.createSelectorQuery().select('.thickness-appearance').boundingClientRect(rect => {
      if (this._thicknessGesture !== gesture || !rect?.width) return;
      gesture.rect = rect;
      this.updateThicknessFromTouch(gesture);
    }).exec();
  },

  onThicknessTouchMove(e) {
    const gesture = this._thicknessGesture;
    if (!gesture?.active || !e.touches?.length) return;
    gesture.clientX = e.touches[0].clientX;
    this.updateThicknessFromTouch(gesture);
  },

  onThicknessTouchEnd(e) {
    const gesture = this._thicknessGesture;
    if (!gesture?.active) return;
    if (e.changedTouches?.length) gesture.clientX = e.changedTouches[0].clientX;
    gesture.active = false;
    this.updateThicknessFromTouch(gesture);
  },

  updateThicknessFromTouch(gesture) {
    if (this.data.savingDisplaySettings || !gesture.rect) return;
    const { left, width } = gesture.rect;
    const ratio = Math.max(0, Math.min(1, (gesture.clientX - left) / width));
    const thicknessMm = Math.round(ratio * 20) / 10;
    if (thicknessMm !== this.data.thicknessMm) this.setData({ thicknessMm });
  },

  onThicknessChange(e) {
    if (this.data.savingDisplaySettings) return;
    const value = Number(e.detail.value);
    if (!Number.isFinite(value)) return;
    this.setData({ thicknessMm: Math.max(0, Math.min(20, Math.round(value))) / 10 });
  },

  stepThickness(e) {
    if (this.data.savingDisplaySettings) return;
    const next = Math.round((this.data.thicknessMm + Number(e.currentTarget.dataset.delta)) * 10);
    this.setData({ thicknessMm: Math.max(0, Math.min(20, next)) / 10 });
  },

  async saveDisplaySettings() {
    if (this.data.savingDisplaySettings) return;
    this.setData({ savingDisplaySettings: true });
    try {
      const { result } = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'manageAchievementCatalog', action: 'saveDisplaySettings', data: { thicknessMm: this.data.thicknessMm },
      });
      if (!result?.ok) throw new Error(result?.error || '保存失败');
      this.setData({ savedThicknessMm: result.displaySettings.thicknessMm });
      clearAchievementCache();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally { this.setData({ savingDisplaySettings: false }); }
  },

  // 全量刷新：逐枚重算背面图、3D 轮廓并整理历史编号，已有素材也一并重算
  async refreshBadges() {
    if (this.data.preparing || this.data.activating) return;
    const badges = this.data.allBadges;
    if (!badges.length) {
      wx.showToast({ title: '暂无可更新的徽章', icon: 'none' });
      return;
    }
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '更新徽章',
      content: `将重新生成 ${badges.length} 枚徽章的背面图、3D 轮廓与历史编号，过程中请保持页面打开。`,
      success: res => resolve(res.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ preparing: true, catalogError: '', prepareSummary: '', generation: { label: '开始生成' } });
    const failed = [];
    try {
      for (let index = 0; index < badges.length; index++) {
        this.setData({ prepareSummary: `第 ${index + 1}/${badges.length} 枚 · ${badges[index].name}`, generation: { label: '开始生成' } });
        const generationId = generateUUID();
        watchGeneration(this, badges[index].key, generationId);
        try {
          let pending;
          do {
            const { result } = await app.mpServerless.function.invoke('unionOp', {
              unionAction: 'manageAchievementCatalog', action: 'prepareBadge', data: { key: badges[index].key, generationId, force: true },
            });
            if (!result?.ok) throw new Error(result?.error || '更新失败');
            pending = result.pending;
            if (pending) this.setData({ generation: { label: '素材已就绪，正在整理历史编号' } });
          } while (pending);
        } catch (error) {
          failed.push(`${badges[index].name}：${error.message || '更新失败'}`);
        } finally { stopGenerationWatch(this); }
      }
      clearAchievementCache();
    } finally {
      this.setData({ preparing: false, generation: null, prepareSummary: '' });
      await this.loadUserCatalog();
    }
    if (failed.length) {
      this.setData({ catalogError: `${failed.length} 枚未完成：${failed.slice(0, 3).join('；')}${failed.length > 3 ? ' 等' : ''}` });
      wx.showToast({ title: `${badges.length - failed.length} 枚已更新，${failed.length} 枚失败`, icon: 'none' });
    } else {
      wx.showToast({ title: '徽章已更新', icon: 'success' });
    }
  },

  // 全部上线：校验素材与编号后批量切 active，不齐的列出原因
  async activateAllBadges() {
    if (this.data.preparing || this.data.activating || !this.data.draftCount) return;
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '全部上线',
      content: `将把 ${this.data.draftCount} 枚草稿徽章切为上线。素材或编号未就绪的会被拦下，上线后达成条件锁定不可修改。`,
      success: res => resolve(res.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ activating: true, catalogError: '' });
    try {
      const { result } = await app.mpServerless.function.invoke('unionOp', {
        unionAction: 'manageAchievementCatalog', action: 'activateAll',
      });
      if (!result?.ok) throw new Error(result?.error || '上线失败');
      clearAchievementCache();
      await this.loadUserCatalog();
      const blocked = result.blocked || [];
      if (blocked.length) {
        const detail = blocked.slice(0, 6).map(item => `${item.name}：${item.reason}`).join('\n');
        await new Promise(resolve => wx.showModal({
          title: `已上线 ${result.activated.length} 枚`,
          content: `${blocked.length} 枚未满足条件：\n${detail}${blocked.length > 6 ? `\n…等 ${blocked.length} 枚` : ''}\n\n请先更新徽章再重试。`,
          showCancel: false,
          complete: resolve,
        }));
      } else {
        wx.showToast({ title: `已上线 ${result.activated.length} 枚`, icon: 'success' });
      }
    } catch (error) {
      wx.showToast({ title: error.message || '上线失败', icon: 'none' });
      this.setData({ catalogError: error.message || '上线失败' });
    } finally { this.setData({ activating: false }); }
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
