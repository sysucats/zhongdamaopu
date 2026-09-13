// 医疗记录管理（管理员）：疫苗、绝育、就诊、驱虫、伤病等（疫苗记录已合并至此）
import { checkAuth } from "../../../utils/user";
import { getCatItem } from "../../../utils/cat";
import api from "../../../utils/cloudApi";
import { formatDate } from "../../../utils/utils";

const TYPE_OPTIONS = [
  { key: 'vaccine', name: '疫苗' },
  { key: 'sterilize', name: '绝育' },
  { key: 'clinic', name: '就诊' },
  { key: 'deworm', name: '驱虫' },
  { key: 'injury', name: '伤病' },
  { key: 'other', name: '其他' },
];

Page({
  data: {
    cat: {},
    records: [],
    loading: true,
    typeOptions: TYPE_OPTIONS,
    typeNameMap: {
      vaccine: '疫苗',
      sterilize: '绝育',
      clinic: '就诊',
      deworm: '驱虫',
      injury: '伤病',
      other: '其他',
    },
    // 编辑弹窗
    showEditModal: false,
    editingId: '',   // 空串表示新增
    form: {
      typeIndex: 0,
      title: '',
      hospital: '',
      record_date: '',
      expire_date: '',       // 疫苗用：有效期至
      next_vaccine_date: '', // 疫苗用：下次接种日期
      description: '',
    },
    submitting: false,
  },

  jsData: {
    cat_id: '',
  },

  async onLoad(options) {
    this.jsData.cat_id = options.cat_id;
    if (!this.jsData.cat_id) {
      wx.showToast({ title: '缺少猫咪信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    if (!(await checkAuth(this, 2))) {
      return;
    }

    const cat = await getCatItem(this.jsData.cat_id);
    this.setData({ cat: cat || {} });
    if (cat && cat.name) {
      wx.setNavigationBarTitle({ title: `${cat.name}的医疗记录` });
    }
    await this.loadRecords();
  },

  async loadRecords() {
    try {
      const res = await api.medicalOp({
        operation: 'list',
        cat_id: this.jsData.cat_id,
      });
      if (res.result) {
        const records = (res.data || []).map(r => ({
          ...r,
          record_date_formatted: r.record_date ? formatDate(r.record_date, 'yyyy-MM-dd') : '',
          expire_date_formatted: r.expire_date ? formatDate(r.expire_date, 'yyyy-MM-dd') : '',
          next_vaccine_date_formatted: r.next_vaccine_date ? formatDate(r.next_vaccine_date, 'yyyy-MM-dd') : '',
        }));
        this.setData({ records, loading: false });
      } else {
        wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('[loadRecords] - 加载医疗记录失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 打开新增弹窗
  addRecord() {
    this.setData({
      showEditModal: true,
      editingId: '',
      form: {
        typeIndex: 0,
        title: '',
        hospital: '',
        record_date: formatDate(new Date(), 'yyyy-MM-dd'),
        expire_date: '',
        next_vaccine_date: '',
        description: '',
      },
    });
  },

  // 打开编辑弹窗
  editRecord(e) {
    const record = this.data.records[e.currentTarget.dataset.index];
    const typeIndex = Math.max(0, TYPE_OPTIONS.findIndex(t => t.key === record.type));
    this.setData({
      showEditModal: true,
      editingId: record._id,
      form: {
        typeIndex,
        title: record.title || '',
        hospital: record.hospital || '',
        record_date: record.record_date ? formatDate(record.record_date, 'yyyy-MM-dd') : '',
        expire_date: record.expire_date ? formatDate(record.expire_date, 'yyyy-MM-dd') : '',
        next_vaccine_date: record.next_vaccine_date ? formatDate(record.next_vaccine_date, 'yyyy-MM-dd') : '',
        description: record.description || '',
      },
    });
  },

  closeEdit() {
    this.setData({ showEditModal: false });
  },

  onTypeChange(e) {
    this.setData({ 'form.typeIndex': Number(e.detail.value) });
  },

  onDateChange(e) {
    this.setData({ 'form.record_date': e.detail.value });
  },

  onExpireDateChange(e) {
    this.setData({ 'form.expire_date': e.detail.value });
  },

  onNextDateChange(e) {
    this.setData({ 'form.next_vaccine_date': e.detail.value });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async saveRecord() {
    const { form, editingId, submitting } = this.data;
    if (submitting) return;

    if (!form.record_date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    const type = TYPE_OPTIONS[form.typeIndex].key;
    if (type !== 'sterilize' && !form.title.trim()) {
      wx.showToast({ title: type === 'vaccine' ? '请填写疫苗名称' : '请填写标题', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...' });

    const data = {
      type,
      title: form.title.trim() || TYPE_OPTIONS[form.typeIndex].name,
      hospital: form.hospital.trim(),
      record_date: form.record_date,
      description: form.description.trim(),
      // 疫苗专用字段（其他类型清空）
      expire_date: type === 'vaccine' ? form.expire_date : '',
      next_vaccine_date: type === 'vaccine' ? form.next_vaccine_date : '',
    };

    try {
      let res;
      if (editingId) {
        res = await api.medicalOp({ operation: 'update', record_id: editingId, data });
      } else {
        data.cat_id = this.jsData.cat_id;
        res = await api.medicalOp({ operation: 'add', data });
      }
      wx.hideLoading();
      wx.showToast({ title: res.msg || (res.result ? '保存成功' : '保存失败'), icon: 'none' });
      if (res.result) {
        this.closeEdit();
        await this.loadRecords();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[saveRecord] - 保存失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 导入旧版疫苗记录（vaccine 集合 → medical）
  async importVaccines() {
    const modalRes = await wx.showModal({
      title: '导入疫苗记录',
      content: '把旧版疫苗记录导入到医疗记录中，已导入过的会自动跳过。要继续吗？',
    });
    if (!modalRes.confirm) return;

    wx.showLoading({ title: '导入中...' });
    try {
      const res = await api.medicalOp({ operation: 'migrateVaccines' });
      wx.hideLoading();
      wx.showToast({ title: res.msg || (res.result ? '导入完成' : '导入失败'), icon: 'none', duration: 2500 });
      if (res.result) {
        await this.loadRecords();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[importVaccines] - 导入失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  async removeRecord(e) {
    const { id, index } = e.currentTarget.dataset;
    const record = this.data.records[index];
    const modalRes = await wx.showModal({
      title: '删除记录',
      content: `确定删除「${record.title || this.data.typeNameMap[record.type]}」这条记录吗？`,
    });
    if (!modalRes.confirm) return;

    wx.showLoading({ title: '删除中...' });
    try {
      const res = await api.medicalOp({ operation: 'remove', record_id: id });
      wx.hideLoading();
      wx.showToast({ title: res.msg || (res.result ? '已删除' : '删除失败'), icon: 'none' });
      if (res.result) {
        await this.loadRecords();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[removeRecord] - 删除失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },
});
