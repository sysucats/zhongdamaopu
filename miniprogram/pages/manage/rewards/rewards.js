import { formatDate } from "../../../utils/utils";
import { checkAuth } from "../../../utils/user";
import { confirmDiscard } from "../../../utils/popup";
import api from "../../../utils/cloudApi";

const app = getApp();

function presentReward(record) {
  const date = new Date(record.recordDate || record.mdate);
  const records_raw = String(record.records || '');
  const paragraphs = records_raw.split('#').filter(text => text.trim());
  return {
    ...record,
    month: formatDate(date, 'yyyy-MM'),
    mdateStr: date.getFullYear() + '年' + (date.getMonth() + 1) + '月',
    timestamp: date.getTime(),
    records_raw,
    preview: paragraphs.join('\n'),
    canExpand: records_raw.length > 100 || paragraphs.length > 3,
    expanded: false,
  };
}

Page({
  data: {
    rewards: [],
    loading: true,
    loadError: '',
    today: formatDate(new Date(), 'yyyy-MM'),
    editingIndex: -1,
    draftMonth: '',
    draftText: '',
    editorError: '',
    saving: false,
  },

  async onLoad() {
    if (await checkAuth(this, 3)) await this.loadRewards();
  },

  async loadRewards() {
    this.setData({ loading: true, loadError: '' });
    try {
      const { result } = await app.mpServerless.db.collection('reward').find({}, { sort: { mdate: -1, recordDate: -1 } });
      this.setData({ rewards: result.map(presentReward).sort((a, b) => b.timestamp - a.timestamp) });
    } catch (error) {
      console.error('加载投喂记录失败', error);
      this.setData({ loadError: '投喂记录加载失败，请重试。' });
    } finally {
      this.setData({ loading: false });
    }
  },

  clickChange(e) {
    if (this.data.editingIndex !== -1 || this.data.saving) return;
    const index = Number(e.currentTarget.dataset.index);
    const reward = this.data.rewards[index];
    if (!reward) return;
    this._initialDraft = { month: reward.month, text: reward.records_raw };
    this.setData({ editingIndex: index, draftMonth: reward.month, draftText: reward.records_raw, editorError: '' });
  },

  addMonth() {
    if (this.data.editingIndex !== -1 || this.data.loading) return;
    this._initialDraft = { month: this.data.today, text: '' };
    this.setData({ editingIndex: -2, draftMonth: this.data.today, draftText: '', editorError: '' });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onMonthChange(e) {
    if (this.data.saving) return;
    const month = e.detail.value;
    const duplicate = this.data.editingIndex === -2 && this.data.rewards.some(item => item.month === month);
    this.setData({ draftMonth: month, editorError: duplicate ? '已有这个月份，请选择其他月份或编辑现有记录。' : '' });
    this.updateDraftGuard();
  },

  onDraftInput(e) {
    if (this.data.saving) return;
    this.setData({ draftText: e.detail.value, editorError: '' });
    this.updateDraftGuard();
  },

  updateDraftGuard() {
    const current = { month: this.data.draftMonth, text: this.data.draftText };
    if (JSON.stringify(current) !== JSON.stringify(this._initialDraft)) {
      wx.enableAlertBeforeUnload?.({ message: '投喂记录尚未保存。' });
    } else {
      wx.disableAlertBeforeUnload?.();
    }
  },

  resetEditor() {
    this._initialDraft = null;
    this.setData({ editingIndex: -1, draftMonth: '', draftText: '', editorError: '' });
    wx.disableAlertBeforeUnload?.();
  },

  async cancelEdit() {
    if (this.data.saving) return;
    const current = { month: this.data.draftMonth, text: this.data.draftText };
    if (await confirmDiscard(this, this._initialDraft, current)) this.resetEditor();
  },

  togglePreview(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.rewards[index]) return;
    this.setData({ [`rewards[${index}].expanded`]: !this.data.rewards[index].expanded });
  },

  async changeConfirm(e) {
    if (this.data.saving || this.data.editingIndex === -1) return;
    const index = this.data.editingIndex;
    const isNew = index === -2;
    const original = isNew ? null : this.data.rewards[index];
    const month = this.data.draftMonth;
    const records = e.detail.value.records_raw;
    this.setData({ draftText: records, editorError: '' });
    this.updateDraftGuard();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > this.data.today) {
      this.setData({ editorError: '请选择有效月份。' });
      return;
    }
    if (isNew && this.data.rewards.some(item => item.month === month)) {
      this.setData({ editorError: '已有这个月份，请选择其他月份或编辑现有记录。' });
      return;
    }
    this.setData({ saving: true });
    try {
      const data = { recordDate: new Date(month + '-01'), records };
      const result = await api.curdOp(isNew
        ? { operation: 'add', collection: 'reward', data }
        : { operation: 'update', collection: 'reward', item_id: original._id, data });
      if (!result || typeof result !== 'object' || result.ok === false || result.matchedCount === 0 || result.n === 0 || (isNew && !result.insertedId)) {
        throw new Error('投喂记录保存失败');
      }
      const saved = presentReward({ ...original, ...data, _id: isNew ? result.insertedId : original._id });
      const rewards = isNew ? [saved, ...this.data.rewards] : this.data.rewards.map((item, i) => i === index ? saved : item);
      this.setData({ rewards: rewards.sort((a, b) => b.timestamp - a.timestamp) });
      this.resetEditor();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) {
      console.error('保存投喂记录失败', error);
      this.setData({ editorError: '保存失败，编辑内容已保留，请重试。' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
