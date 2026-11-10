import { checkAuth } from "../../../../utils/user";
import { uploadFile, signCosUrl } from "../../../../utils/common";
import { generateUUID } from "../../../../utils/utils";
import { clearAchievementCache } from "../../../../utils/achievement";

const app = getApp();
const METRIC_LABELS = { view: '浏览猫猫', follow: '关注猫猫', photo: '上传照片', comment: '发布便利贴', like: '点赞' };

function decodeOption(value = '') {
  try { return decodeURIComponent(value); } catch (error) { return value; }
}

async function callCatalog(action, data) {
  const response = await app.mpServerless.function.invoke('unionOp', { unionAction: 'manageAchievementCatalog', action, data });
  const result = response.result;
  if (!result?.ok) throw new Error(result?.error || '操作失败');
  return result;
}

Page({
  data: {
    mode: 'badge',
    isNew: true,
    form: {},
    previews: {},
    metricOptions: [],
    materialOptions: [],
    seriesOptions: [],
    metricIndex: 0,
    materialIndex: 0,
    loading: true,
    loadError: '',
    formError: '',
    showMore: false,
    ruleDescription: '',
    selectedMaterial: null,
    backPending: false,
    ruleLocked: false,
    holders: 0,
    saving: false,
    deleting: false,
    uploading: false,
  },

  async onLoad(options) {
    this.editorOptions = options;
    this.setData({ loading: true, loadError: '' });
    if (!await checkAuth(this, 2)) return;
    const mode = options.mode === 'material' ? 'material' : 'badge';
    const key = options.key || '';
    wx.setNavigationBarTitle({ title: mode === 'material' ? (key ? '编辑材质' : '添加材质') : (key ? '编辑成就' : '新增成就') });
    try {
      const result = await callCatalog('list');
      const metricOptions = Object.keys(result.metrics || {}).map(id => ({ key: id, ...result.metrics[id], label: METRIC_LABELS[id] || result.metrics[id].name }));
      const materialOptions = result.materials || [];
      if (mode === 'material') {
        const current = materialOptions.find(item => item.key === key);
        if (key && !current) throw new Error('材质不存在');
        const form = current ? { key, name: current.name, image: current.image } : { key: `mat_${generateUUID().replace(/-/g, '')}`, name: '', image: '' };
        this.setData({ mode, isNew: !current, form });
        await this.loadPreviews({ image: form.image });
        return;
      }
      const badges = result.badges || [];
      const initialMetric = metricOptions.find(item => item.key === options.metric)?.key || metricOptions[0]?.key || '';
      const current = badges.find(item => item.key === key);
      this.originalBadge = current || null;
      if (key && !current) throw new Error('徽章不存在');
      const form = current
        ? { key, series: current.series, name: current.name, description: current.description || '', materialKey: current.materialKey, frontImage: current.frontImage, backImage: current.backImage, rule: { ...current.rule }, sort: current.sort || 0, status: current.status }
        : { key: `ach_${generateUUID().replace(/-/g, '')}`, series: decodeOption(options.series) || '日常', name: '', description: '', materialKey: materialOptions[0]?.key || '', frontImage: '', backImage: '', rule: { metric: initialMetric, count: 1 }, sort: badges.length ? Math.max(...badges.map(item => Number(item.sort) || 0)) + 1 : 0, status: 'draft' };
      this.setData({
        mode,
        isNew: !current,
        form,
        metricOptions,
        materialOptions,
        seriesOptions: [...new Set(badges.map(item => item.series).filter(Boolean))],
        holders: current?.holders || 0,
        ruleLocked: Boolean(current && (current.status === 'active' || current.holders > 0)),
        metricIndex: Math.max(0, metricOptions.findIndex(item => item.key === form.rule.metric)),
        materialIndex: Math.max(0, materialOptions.findIndex(item => item.key === form.materialKey)),
      });
      this.updateDerived();
      await this.loadPreviews({ frontImage: form.frontImage, backImage: form.backImage });
    } catch (error) {
      this.setData({ loadError: error.message || '读取失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadPreviews(urls) {
    const previews = {};
    await Promise.all(Object.keys(urls).map(async field => {
      if (urls[field]) previews[field] = await signCosUrl(urls[field]);
    }));
    this.setData({ previews });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    if (this.data.ruleLocked && field === 'rule.count') return;
    this.setData({ [`form.${field}`]: e.detail.value, formError: '' });
    if (field === 'rule.count') this.updateDerived();
  },

  retryLoad() { this.onLoad(this.editorOptions || {}); },

  toggleMore() { this.setData({ showMore: !this.data.showMore }); },

  updateDerived() {
    const { form, metricOptions, materialOptions } = this.data;
    const metric = metricOptions.find(item => item.key === form.rule?.metric);
    const selectedMaterial = materialOptions.find(item => item.key === form.materialKey) || null;
    const original = this.originalBadge;
    this.setData({
      ruleDescription: (metric?.desc || '').replace('{}', form.rule?.count || '…'),
      selectedMaterial,
      backPending: !original?.backImage || form.frontImage !== original.frontImage || form.materialKey !== original.materialKey || selectedMaterial?.image !== original.backMaterialImage,
    });
  },

  pickSeries(e) {
    this.setData({ 'form.series': e.currentTarget.dataset.series });
  },

  onPick(e) {
    const field = e.currentTarget.dataset.field;
    const index = Number(e.detail.value);
    if (field === 'metric' && this.data.metricOptions[index]) {
      if (this.data.ruleLocked) return;
      this.setData({ 'form.rule.metric': this.data.metricOptions[index].key, metricIndex: index });
    } else if (field === 'material' && this.data.materialOptions[index]) {
      this.setData({ 'form.materialKey': this.data.materialOptions[index].key, materialIndex: index });
    }
    this.setData({ formError: '' });
    this.updateDerived();
  },

  onStatusChange(e) {
    if (this.data.form.status === 'active' && this.data.holders > 0) return;
    this.setData({ 'form.status': e.detail.value ? 'active' : 'draft', formError: '' });
  },

  async chooseImage(e) {
    if (this.data.uploading || this.data.saving) return;
    const field = e.currentTarget.dataset.field;
    try {
      const picked = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'] });
      const path = picked.tempFiles?.[0]?.tempFilePath;
      if (!path) return;
      const info = await wx.getImageInfo({ src: path });
      if (info.type !== 'png') throw new Error('请选择透明 PNG 图片');
      if (picked.tempFiles[0].size > 5 * 1024 * 1024 || info.width > 2048 || info.height > 2048) throw new Error('图片需小于等于 5 MB，宽高不超过 2048 像素');
      this.setData({ uploading: true });
      const folder = field === 'image' ? 'materials' : 'fronts';
      const uploaded = await uploadFile({ cloudPath: `/achievement/${folder}/${generateUUID()}.png`, filePath: path });
      if (!uploaded.fileUrl) throw new Error('上传失败');
      this.setData({ [`form.${field}`]: uploaded.fileUrl.split('?')[0], [`previews.${field}`]: path });
      this.setData({ formError: '' });
      if (this.data.mode === 'badge') this.updateDerived();
    } catch (error) {
      if (error?.errMsg?.includes('cancel')) return;
      wx.showToast({ title: error.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async save() {
    if (this.data.saving || this.data.uploading || this.data.loading || this.data.loadError) return;
    const { mode, form, isNew } = this.data;
    let error = '';
    if (!form.name?.trim()) error = mode === 'material' ? '请填写材质名称' : '请填写成就名称';
    else if (mode === 'material' && !form.image) error = '请上传材质图片';
    else if (mode === 'badge') {
      if (!form.series?.trim()) error = '请在更多设置中填写系列';
      else if (!this.data.metricOptions.some(item => item.key === form.rule.metric) || !Number.isInteger(Number(form.rule.count)) || Number(form.rule.count) < 1 || Number(form.rule.count) > 100000) error = '达成数量需为 1～100000 的整数';
      else if (!this.data.selectedMaterial?.image) error = '请选择已上传图片的材质';
      else if (!form.frontImage) error = '请上传成就正面图片';
    }
    if (error) {
      this.setData({ formError: error, ...(!form.series?.trim() && mode === 'badge' ? { showMore: true } : {}) });
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    this.setData({ saving: true, formError: '' });
    try {
      const data = mode === 'material'
        ? { ...form, isNew }
        : { ...form, isNew, sort: Number(form.sort) || 0, rule: { metric: form.rule.metric, count: Number(form.rule.count) } };
      const result = await callCatalog(mode === 'material' ? 'saveMaterial' : 'saveBadge', data);
      clearAchievementCache();
      if (mode === 'material' && (result.regenerated || result.failed)) {
        await new Promise(resolve => wx.showModal({
          title: '材质已保存',
          content: `重新生成背面 ${result.regenerated} 枚${result.failed ? `，失败 ${result.failed} 枚，可再次保存重试` : ''}。`,
          showCancel: false,
          complete: resolve,
        }));
      } else {
        wx.showToast({ title: '已保存', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
      this.setData({ saving: false, formError: error.message || '保存失败' });
    }
  },

  async remove() {
    if (this.data.saving || this.data.uploading || this.data.loading) return;
    if (this.data.mode !== 'badge' || this.data.isNew || this.data.holders > 0) return;
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '删除成就',
      content: `确定删除「${this.data.form.name}」吗？`,
      success: res => resolve(res.confirm),
      fail: () => resolve(false),
    }));
    if (!confirmed) return;
    this.setData({ saving: true, deleting: true });
    try {
      await callCatalog('deleteBadge', { key: this.data.form.key });
      clearAchievementCache();
      wx.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' });
      this.setData({ saving: false, deleting: false });
    }
  },
});
