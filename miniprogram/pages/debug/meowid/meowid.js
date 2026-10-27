import api from "../../../utils/cloudApi";
import { checkAuth } from "../../../utils/user";
import { getGlobalSettings } from "../../../utils/page";
import { getRecognizeMode } from "../../../utils/recognize";

Page({
  data: {
    auth: false, isManager: false, loading: false, syncing: false, syncMode: 'all',
    modeLabels: ['关闭识猫', '独立部署识猫函数', 'MeowID'],
    modes: ['off', 'custom', 'meowid'], modeIndex: 0,
    pageCfg: { mode: 'off', secretKey: '' },
    cfgProjectId: '', cfgApiKey: '', cfgBaseUrl: '', cfgTopK: 5, cfgEnrollImages: 5,
    cfgStatus: null, syncStatus: null, savedImageLimit: null, syncLimitDirty: false, result: '',
  },

  async onShow() {
    this.stopSync = false;
    const isManager = await checkAuth(this, 99);
    this.setData({ isManager });
    if (!isManager) return;
    await this.loadPageCfg();
    if (this.data.pageCfg.mode === 'meowid') await this.call('syncStatus');
  },

  onHide() { this.stopSync = true; },
  onUnload() { this.stopSync = true; },

  async loadPageCfg() {
    const settings = await getGlobalSettings(null, { nocache: true }) || {};
    const record = settings.recognize || {};
    const mode = getRecognizeMode(record);
    this.setData({ pageCfg: { mode, secretKey: record.secretKey || '' }, modeIndex: this.data.modes.indexOf(mode) });
  },

  onModeChange(event) {
    if (this.data.syncing) return;
    const index = Number(event.detail.value);
    if (!this.data.modes[index]) return;
    this.setData({ modeIndex: index, 'pageCfg.mode': this.data.modes[index], result: '' });
  },

  pageCfgInput(event) { this.setData({ 'pageCfg.secretKey': event.detail.value }); },

  onCopyGuide() {
    wx.setClipboardData({
      data: 'https://meowid.net/zh-cn/developers/zhongdamaopu',
      success: () => wx.showModal({
        title: '文档链接已复制',
        content: '请在浏览器中粘贴打开 MeowID 接入文档。',
        showCancel: false,
      }),
      fail: () => wx.showToast({ icon: 'none', title: '复制失败，请重试' }),
    });
  },

  async onSavePageCfg() {
    let settings;
    try { settings = await getGlobalSettings(null, { nocache: true }) || {}; }
    catch (error) { wx.showToast({ icon: 'none', title: '读取设置失败，未保存，请重试' }); return; }
    const recognize = Object.assign({}, settings.recognize || {}, {
      mode: this.data.pageCfg.mode, showRecognizeBtn: this.data.pageCfg.mode !== 'off',
      secretKey: String(this.data.pageCfg.secretKey || '').trim(),
    });
    try {
      const result = await api.curdOp({ operation: 'update', collection: 'setting', item_id: 'pages', data: { recognize } });
      if (!result || !result.ok) throw new Error('保存失败');
      wx.showToast({ title: '已保存', icon: 'success' });
      await this.loadPageCfg();
    } catch (error) { wx.showToast({ icon: 'none', title: '保存失败，请重试' }); }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value, ...(field === 'cfgEnrollImages' ? { syncLimitDirty: true } : {}) });
  },

  async call(action, extra = {}) {
    if (this.data.loading || !this.data.isManager) return;
    this.setData({ loading: true });
    try {
      const result = await api.meowid({ action, ...extra });
      this.setData({ result: result && (result.ok || result.code === 'timeout') ? '' : (result && result.msg) || '操作失败' });
      if (result && result.config) this.setData({ cfgStatus: result.config, cfgTopK: result.config.topK || 5 });
      const limit = Number(result && ((result.sync && result.sync.imageLimit) || (result.config && result.config.enrollImagesPerCat)));
      if (Number.isSafeInteger(limit) && limit >= 5) {
        this.setData({ savedImageLimit: limit, ...(!this.data.syncLimitDirty ? { cfgEnrollImages: limit } : {}) });
      } else if (result && result.config) this.setData({ savedImageLimit: null });
      if (result && result.sync) this.setData({ syncStatus: {
        ...result.sync,
        remainingCats: Math.max(0, result.sync.cats - result.sync.bound),
        remainingPhotos: Math.max(0, result.sync.total - result.sync.accepted),
      } });
      if (result && result.meowid && !result.meowid.reachable) this.setData({ result: result.meowid.code === 'timeout' ? '' : result.meowid.msg || '连接服务失败' });
      return result;
    } catch (error) {
      this.setData({ result: ['FunctionTimeout', 'timeout'].includes(error.code)
        ? '' : '网络或服务异常，请检查云函数日志。' });
      return { ok: false };
    } finally { this.setData({ loading: false }); }
  },

  async onSaveConfig() {
    const data = { MEOWID_TOP_K: Math.max(1, Math.min(100, parseInt(this.data.cfgTopK, 10) || 5)) };
    if (this.data.cfgProjectId.trim()) data.MEOWID_PROJECT_ID = this.data.cfgProjectId.trim();
    if (this.data.cfgApiKey.trim()) data.MEOWID_API_KEY = this.data.cfgApiKey.trim();
    if (this.data.cfgBaseUrl.trim()) data.MEOWID_BASE_URL = this.data.cfgBaseUrl.trim();
    const result = await this.call('saveConfig', { data });
    this.setData({ cfgApiKey: '' });
    if (result && result.ok) { wx.showToast({ title: '已保存' }); await this.call('syncStatus'); }
  },

  async onSaveSyncConfig() {
    if (this.data.loading || this.data.syncing) return;
    const limit = Number(this.data.cfgEnrollImages);
    if (!Number.isSafeInteger(limit) || limit < 5) {
      wx.showToast({ icon: 'none', title: '每猫图片上限请填写至少 5 的整数' });
      return;
    }
    const result = await this.call('saveConfig', { data: { MEOWID_ENROLL_IMAGES_PER_CAT: limit } });
    if (!result || !result.ok) return;
    const refreshed = await this.call('syncStatus');
    if (!refreshed || !refreshed.ok) {
      wx.showToast({ icon: 'none', title: '未能读取保存结果，请重试' });
      return;
    }
    if (this.data.savedImageLimit === limit) {
      this.setData({ syncLimitDirty: false });
      wx.showToast({ title: '同步上限已保存', icon: 'success' });
    } else this.setData({ result: this.data.savedImageLimit === null
      ? '云函数未返回同步上限，请部署最新版 unionOp 后重新保存。'
      : '云端上限与输入值不一致，请重新保存。' });
  },

  onCheckConnection() { return this.call('syncStatus', { ping: true }); },

  onStatus() { return this.call('status'); },

  onSyncAll() { return this.startSync(false); },

  onSyncLimited() { return this.startSync(true); },

  async startSync(limited) {
    if (this.data.syncing || this.data.loading) return;
    if (limited && this.data.syncLimitDirty) {
      wx.showToast({ icon: 'none', title: '请先保存同步上限' });
      return;
    }
    let savedLimit = this.data.savedImageLimit;
    if (limited && (!Number.isSafeInteger(savedLimit) || savedLimit < 5)) {
      const refreshed = await this.call('syncStatus');
      if (!refreshed || !refreshed.ok) {
        wx.showToast({ icon: 'none', title: '读取同步上限失败，请重试' });
        return;
      }
      savedLimit = this.data.savedImageLimit;
      if (!Number.isSafeInteger(savedLimit) || savedLimit < 5) {
        wx.showModal({ title: '需要更新云函数',
          content: '当前 unionOp 未返回每猫图片上限，无法按上限同步。请部署 functionsEMAS/unionOp 的最新代码，然后重新进入此页并保存同步上限。',
          showCancel: false });
        return;
      }
    }
    wx.showModal({
      title: limited ? '按上限同步' : '全量 / 增量同步',
      content: (limited ? '每猫累计最多上传 ' + savedLimit + ' 张（已保存设置）。' : '同步全部猫咪档案和审核通过的照片，不限制每猫数量；之前因上限暂缓的照片也会补传。') +
        '已受理、有任务编号和结果待核对的照片不重传。注册会产生第三方用量，请勿清空原同步记录。',
      success: async response => {
        if (!response.confirm || this.data.syncing || this.data.loading) return;
        this.stopSync = false;
        const syncMode = limited ? 'limited' : 'all';
        this.setData({ syncing: true, syncMode });
        try {
          await this.call('status');
          let action = 'syncAll';
          let batches = 0;
          while (!this.stopSync) {
            const result = await this.call(action, { syncMode });
            if (!result || !result.ok) break;
            if (result.busy) {
              this.setData({ result: '另一批同步正在执行，请稍后点击继续。' });
              break;
            }
            if (!result.more) {
              await this.call('status');
              const progress = this.data.syncStatus || result.sync;
              this.setData({ result: progress && (progress.remainingCats || progress.remainingPhotos)
                ? (limited ? '本轮按上限同步已结束；超出上限的照片可提高上限后补传，或选择全量 / 增量同步。' : '本轮同步已结束。') +
                  '仍有未同步记录，请查看剩余数量、失败及待核对提示。'
                : '本轮上传已结束，可点击刷新状态查看注册结果。' });
              break;
            }
            if (++batches % 5 === 0 && !this.stopSync) await this.call('status');
            action = 'syncNext';
          }
        } finally { this.setData({ syncing: false }); }
      },
    });
  },
});
