import api from "../../utils/cloudApi";
import { formatDate } from "../../utils/utils";

const TYPES = [
  { key: 'vaccine', name: '疫苗' },
  { key: 'sterilize', name: '绝育' },
  { key: 'clinic', name: '就诊' },
  { key: 'deworm', name: '驱虫' },
  { key: 'injury', name: '伤病' },
  { key: 'other', name: '其他' },
];
const TYPE_NAMES = Object.fromEntries(TYPES.map(({ key, name }) => [key, name]));

function emptyForm() {
  return {
    typeIndex: 0,
    title: '',
    record_date: formatDate(new Date(), 'yyyy-MM-dd'),
    hospital: '',
    description: '',
    expire_date: '',
    next_vaccine_date: '',
  };
}

function displayRecord(record) {
  return {
    ...record,
    offsetX: 0,
    record_date_formatted: record.record_date ? formatDate(record.record_date, 'yyyy-MM-dd') : '',
    expire_date_formatted: record.expire_date ? formatDate(record.expire_date, 'yyyy-MM-dd') : '',
    next_vaccine_date_formatted: record.next_vaccine_date ? formatDate(record.next_vaccine_date, 'yyyy-MM-dd') : '',
  };
}

Component({
  properties: {
    catId: {
      type: String,
      value: '',
      observer(catId) {
        if (catId && this._attached) this.refresh();
      },
    },
  },

  data: {
    records: [],
    loading: true,
    types: TYPES,
    typeNames: TYPE_NAMES,
    editingId: '',
    showEditor: false,
    form: emptyForm(),
    submitting: false,
  },

  lifetimes: {
    attached() {
      this._attached = true;
      if (this.properties.catId) this.refresh();
    },
    detached() {
      this._attached = false;
      this._requestId = (this._requestId || 0) + 1;
    },
  },

  methods: {
    async refresh() {
      const catId = this.properties.catId;
      if (!catId) return;
      const requestId = this._requestId = (this._requestId || 0) + 1;
      this.setData({ loading: true });
      try {
        const res = await api.medicalOp({ operation: 'list', cat_id: catId });
        if (requestId !== this._requestId) return;
        if (!res?.result) throw new Error(res?.msg || '加载失败');
        this.setData({ records: (res.data || []).map(displayRecord), loading: false });
      } catch (error) {
        if (requestId !== this._requestId) return;
        console.error('[medicalRecords] 加载失败', error);
        wx.showToast({ title: '加载医疗记录失败', icon: 'none' });
        this.setData({ loading: false });
      }
    },

    addRecord() {
      this.closeSwipeActions();
      this.setData({ editingId: '', form: emptyForm(), showEditor: true });
    },

    editRecord(e) {
      const record = this.data.records.find(item => item._id === e.currentTarget.dataset.id);
      if (!record) return;
      this.closeSwipeActions();
      this.setData({
        editingId: record._id,
        showEditor: true,
        form: {
          typeIndex: Math.max(0, TYPES.findIndex(type => type.key === record.type)),
          title: record.title || '',
          record_date: record.record_date_formatted,
          hospital: record.hospital || '',
          description: record.description || '',
          expire_date: record.expire_date_formatted,
          next_vaccine_date: record.next_vaccine_date_formatted,
        },
      });
    },

    closeEditor() {
      if (!this.data.submitting) this.setData({ showEditor: false });
    },

    onTypeChange(e) {
      this.setData({ 'form.typeIndex': Number(e.detail.value) });
    },

    onDateChange(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ [`form.${field}`]: e.detail.value });
    },

    onInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ [`form.${field}`]: e.detail.value });
    },

    async saveRecord() {
      if (this.data.submitting) return;
      const { form, editingId } = this.data;
      const type = TYPES[form.typeIndex]?.key;
      if (!type || !form.record_date || (type !== 'sterilize' && !form.title.trim())) {
        wx.showToast({ title: '请填写类型、标题和日期', icon: 'none' });
        return;
      }
      const data = {
        type,
        title: form.title.trim() || TYPE_NAMES[type],
        record_date: form.record_date,
        hospital: form.hospital.trim(),
        description: form.description.trim(),
        expire_date: type === 'vaccine' ? form.expire_date : '',
        next_vaccine_date: type === 'vaccine' ? form.next_vaccine_date : '',
      };
      const request = editingId
        ? { operation: 'update', record_id: editingId, data }
        : { operation: 'add', data: { ...data, cat_id: this.properties.catId } };
      this.setData({ submitting: true });
      wx.showLoading({ title: '保存中...', mask: true });
      try {
        const res = await api.medicalOp(request);
        if (!res?.result) throw new Error(res?.msg || '保存失败');
        this.setData({ showEditor: false });
        await this.refresh();
        this.triggerEvent('recordsChanged');
        wx.showToast({ title: '保存成功', icon: 'success' });
      } catch (error) {
        console.error('[medicalRecords] 保存失败', error);
        wx.showToast({ title: error.message || '保存失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    },

    async deleteRecord(e) {
      const record = this.data.records.find(item => item._id === e.currentTarget.dataset.id);
      if (!record) return;
      this.closeSwipeActions();
      const confirmation = await wx.showModal({
        title: '删除记录',
        content: `确定删除「${record.title || TYPE_NAMES[record.type]}」吗？`,
        confirmText: '删除',
        confirmColor: '#d84a43',
      });
      if (!confirmation.confirm) return;
      wx.showLoading({ title: '删除中...' });
      try {
        const res = await api.medicalOp({ operation: 'remove', record_id: record._id });
        if (!res?.result) throw new Error(res?.msg || '删除失败');
        await this.refresh();
        this.triggerEvent('recordsChanged');
        wx.showToast({ title: '已删除', icon: 'success' });
      } catch (error) {
        console.error('[medicalRecords] 删除失败', error);
        wx.showToast({ title: error.message || '删除失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    closeSwipeActions(exceptIndex = -1) {
      const changes = {};
      this.data.records.forEach((record, index) => {
        if (index !== exceptIndex && record.offsetX) {
          changes[`records[${index}].offsetX`] = 0;
        }
      });
      if (Object.keys(changes).length) this.setData(changes);
    },

    touchStart(e) {
      if (this.data.loading || !e.touches.length) return;
      const index = Number(e.currentTarget.dataset.index);
      const record = this.data.records[index];
      if (!record) return;
      const touch = e.touches[0];
      this.closeSwipeActions(index);
      this._swipe = {
        index,
        startX: touch.clientX,
        startY: touch.clientY,
        startOffset: record.offsetX || 0,
        windowWidth: wx.getSystemInfoSync().windowWidth || 375,
        moved: false,
        vertical: false,
      };
    },

    touchMove(e) {
      const swipe = this._swipe;
      if (!swipe || !e.touches.length || swipe.vertical) return;
      const touch = e.touches[0];
      const dx = touch.clientX - swipe.startX;
      const dy = touch.clientY - swipe.startY;
      if (!swipe.moved && Math.abs(dy) > Math.abs(dx)) {
        swipe.vertical = true;
        return;
      }
      if (Math.abs(dx) < 5) return;
      swipe.moved = true;
      const offsetX = Math.max(-300, Math.min(0, Math.round(swipe.startOffset + dx * 750 / swipe.windowWidth)));
      this.setData({ [`records[${swipe.index}].offsetX`]: offsetX });
    },

    touchEnd(e) {
      const swipe = this._swipe;
      if (!swipe) return;
      if (swipe.moved) {
        const dx = (e.changedTouches?.[0]?.clientX ?? swipe.startX) - swipe.startX;
        const deltaRpx = dx * 750 / swipe.windowWidth;
        const offsetX = swipe.startOffset === 0
          ? (deltaRpx < -80 ? -300 : 0)
          : (deltaRpx > 80 ? 0 : -300);
        this.setData({ [`records[${swipe.index}].offsetX`]: offsetX });
      }
      this._swipe = null;
    },

  },
});
