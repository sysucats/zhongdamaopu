import { checkAuth } from "../../../../utils/user";
import { uploadFile, signCosUrl } from "../../../../utils/common";
import { generateUUID } from "../../../../utils/utils";
import { clearAchievementCache, materialPillStyle, describeRule } from "../../../../utils/achievement";

import { watchGeneration, stopGenerationWatch } from "../generationProgress";

const app = getApp();

function decodeOption(value = '') {
  try { return decodeURIComponent(value); } catch (error) { return value; }
}

async function callCatalog(action, data) {
  const response = await app.mpServerless.function.invoke('unionOp', { unionAction: 'manageAchievementCatalog', action, data });
  const result = response.result;
  if (!result?.ok) throw new Error(result?.error || '操作失败');
  return result;
}

// 统计方式：total 按次数（默认），days / cats 需统计项支持
const AGG_OPTIONS = [
  { key: 'total', name: '按次数' },
  { key: 'days', name: '按天数', unit: '天' },
  { key: 'cats', name: '按不同猫数', unit: '只' },
];

// 设备本地日期 YYYY-MM-DD，作为时间窗口的默认值
// 测试：只对超级管理员展示和发放，用于在正式环境验收
const STATUS_OPTIONS = [
  { key: 'draft', name: '草稿' },
  { key: 'test', name: '超管测试' },
  { key: 'active', name: '上线' },
];

// 与后端一致：已有人获得后，上线的不能下线，测试的只能上线
function statusAllowed(from, to, holders) {
  if (!from || from === to || !holders) return true;
  return from === 'test' && to === 'active';
}

function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

// 提交给云函数的规则：只带已设置的条件
function ruleForSave(rule) {
  return {
    metric: rule.metric,
    count: Number(rule.count),
    ...(rule.window && { window: { start: rule.window.start, end: rule.window.end } }),
    ...(rule.agg && rule.agg !== 'total' && { agg: rule.agg }),
    ...(rule.filter?.catId && { filter: { catId: rule.filter.catId } }),
  };
}

// 颜色换算：滑杆用 HSL（h 0-359，s/l 0-100），存储用 #rrggbb
function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60 + 360) % 360;
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex({ h, s, l }) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// 与白底的对比度（WCAG），低于 3 提示名称可能看不清
function contrastOnWhite(hex) {
  const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

Page({
  data: {
    statusOptions: STATUS_OPTIONS,
    originalStatus: '',
    autoColor: '',
    imageChanged: false,
    materialUsage: 0,
    customColor: false,
    pillStyle: '',
    hexInput: '',
    hsl: { h: 0, s: 0, l: 0 },
    hslTracks: {},
    lowContrast: false,
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
    ruleDescription: '',
    aggOptions: [],
    supportsWindow: false,
    supportsCat: false,
    countLabel: '',
    countUnit: '',
    filterCatName: '',
    showCatSelect: false,
    selectedMaterial: null,
    backPending: false,
    generation: null,
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
      // name 是成就页的类别名（如「猫口普查」），label 是统计口径（如「浏览猫猫」）
      const metricOptions = Object.keys(result.metrics || {}).map(id => ({
        key: id, ...result.metrics[id],
        name: result.metrics[id].name || result.metrics[id].label || id,
        label: result.metrics[id].label || result.metrics[id].name || id,
      }));
      const materialOptions = result.materials || [];
      if (mode === 'material') {
        const current = materialOptions.find(item => item.key === key);
        if (key && !current) throw new Error('材质不存在');
        // color 为空表示自动取色；手选过的颜色回填到表单
        const form = current
          ? { key, name: current.name, image: current.image, color: current.colorAuto === false ? current.color || '' : '' }
          : { key: `mat_${generateUUID().replace(/-/g, '')}`, name: '', image: '', color: '' };
        // 自动色由云函数按材质图取好；旧数据没有 autoColor 时，自动模式下的 color 就是自动色
        const autoColor = current?.autoColor || (current && current.colorAuto !== false ? current.color || '' : '');
        // 引用该材质的徽章数：换图后保存会重新生成它们的背面，写在保存按钮上
        const materialUsage = current ? (result.badges || []).filter(item => item.materialKey === key).length : 0;
        this.setData({ mode, isNew: !current, form, autoColor, materialUsage, originalImage: form.image, imageChanged: false, generation: current?.generation || null });
        this.updatePill();
        // 手选过颜色：直接展开自定义
        if (form.color) this.setCustomColor(form.color);
        await this.loadPreviews({ image: form.image });
        return;
      }
      const badges = result.badges || [];
      const initialMetric = metricOptions.find(item => item.key === options.metric)?.key || metricOptions[0]?.key || '';
      const current = badges.find(item => item.key === key);
      this.originalBadge = current || null;
      if (key && !current) throw new Error('徽章不存在');
      const form = current
        ? { key, series: current.series, name: current.name, description: current.description || '', materialKey: current.materialKey, frontImage: current.frontImage, backImage: current.backImage, rule: ruleForSave(current.rule), sort: current.sort || 0, status: current.status }
        : { key: `ach_${generateUUID().replace(/-/g, '')}`, series: decodeOption(options.series) || '日常', name: '', description: '', materialKey: materialOptions[0]?.key || '', frontImage: '', backImage: '', rule: { metric: initialMetric, count: 1 }, sort: badges.length ? Math.max(...badges.map(item => Number(item.sort) || 0)) + 1 : 0, status: 'draft' };
      this.setData({
        mode,
        isNew: !current,
        form,
        metricOptions,
        materialOptions,
        seriesOptions: [...new Set(badges.map(item => item.series).filter(Boolean))],
        holders: current?.holders || 0,
        originalStatus: current?.status || '',
        statusOptions: STATUS_OPTIONS.map(item => ({ ...item, disabled: !statusAllowed(current?.status, item.key, current?.holders || 0) })),
        generation: current?.generation || null,
        ruleLocked: Boolean(current && (current.status === 'active' || current.holders > 0)),
        metricIndex: Math.max(0, metricOptions.findIndex(item => item.key === form.rule.metric)),
        materialIndex: Math.max(0, materialOptions.findIndex(item => item.key === form.materialKey)),
      });
      this.updateDerived();
      this.loadFilterCatName();
      await this.loadPreviews({ frontImage: form.frontImage, backImage: form.backImage });
    } catch (error) {
      this.setData({ loadError: error.message || '读取失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUnload() { stopGenerationWatch(this); },

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

  // 名称文字色：空串 = 自动取色
  useAutoColor() {
    this.setData({ 'form.color': '', customColor: false, lowContrast: false });
    this.updatePill();
  },

  // 胶囊预览与「我的成就」同一套规则
  updatePill() {
    const { form, autoColor } = this.data;
    this.setData({ pillStyle: materialPillStyle(form.color || autoColor) });
  },

  // 自定义颜色：从当前颜色（或自动色）起步
  openCustomColor() {
    const start = this.data.form.color || this.data.autoColor || '#8a5cd0';
    this.setCustomColor(start);
  },

  onHsl(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.hsl[key] === e.detail.value) return;
    const hsl = { ...this.data.hsl, [key]: e.detail.value };
    this.setCustomColor(hslToHex(hsl), hsl);
  },

  onHexInput(e) {
    let value = e.detail.value.trim();
    if (value && value[0] !== '#') value = '#' + value;
    if (/^#[0-9a-f]{6}$/i.test(value)) this.setCustomColor(value.toLowerCase());
    else this.setData({ hexInput: value });
  },

  setCustomColor(hex, hsl = hexToHsl(hex)) {
    this.setData({
      customColor: true,
      'form.color': hex,
      hexInput: hex.toUpperCase(),
      hsl,
      hslTracks: {
        s0: hslToHex({ h: hsl.h, s: 0, l: hsl.l }),
        s1: hslToHex({ h: hsl.h, s: 100, l: hsl.l }),
        l50: hslToHex({ h: hsl.h, s: hsl.s, l: 50 }),
      },
      lowContrast: contrastOnWhite(hex) < 3,
    });
    this.updatePill();
  },

  retryLoad() { this.onLoad(this.editorOptions || {}); },

  updateDerived() {
    const { form, metricOptions, materialOptions } = this.data;
    const metric = metricOptions.find(item => item.key === form.rule?.metric);
    const selectedMaterial = materialOptions.find(item => item.key === form.materialKey) || null;
    const original = this.originalBadge;
    const supports = metric?.supports || [];
    const aggOptions = AGG_OPTIONS.filter(item => item.key === 'total' || supports.includes(item.key));
    const agg = AGG_OPTIONS.find(item => item.key === (form.rule?.agg || 'total'));
    const metrics = Object.fromEntries(metricOptions.map(item => [item.key, item]));
    this.setData({
      ruleDescription: describeRule(form.rule, metrics),
      supportsWindow: supports.includes('window'),
      supportsCat: supports.includes('catId'),
      fixedCount: Boolean(metric?.catDesc && form.rule?.filter),
      aggOptions: aggOptions.length > 1 ? aggOptions : [],
      countLabel: agg?.key === 'days' ? `${metric?.label || ''}的天数` : agg?.key === 'cats' ? `${metric?.label || ''}的不同猫数` : metric?.label || '',
      countUnit: agg?.unit || metric?.unit || '',
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
      // 换统计项时去掉新统计项不支持的条件
      const metric = this.data.metricOptions[index];
      const supports = metric.supports || [];
      const rule = { ...this.data.form.rule, metric: metric.key };
      if (!supports.includes('window')) delete rule.window;
      if (rule.agg && !supports.includes(rule.agg)) delete rule.agg;
      if (!supports.includes('catId')) delete rule.filter;
      if (rule.filter && metric.catDesc) rule.count = 1;
      this.setData({ 'form.rule': rule, metricIndex: index, filterCatName: rule.filter ? this.data.filterCatName : '' });
    } else if (field === 'material' && this.data.materialOptions[index]) {
      this.setData({ 'form.materialKey': this.data.materialOptions[index].key, materialIndex: index });
    }
    this.setData({ formError: '' });
    this.updateDerived();
  },

  onAgg(e) {
    if (this.data.ruleLocked) return;
    const agg = e.currentTarget.dataset.agg;
    const rule = { ...this.data.form.rule };
    if (agg === 'total') delete rule.agg;
    else rule.agg = agg;
    // 按不同猫数统计时不能再限定单只猫
    if (agg === 'cats') delete rule.filter;
    this.setData({ 'form.rule': rule, filterCatName: rule.filter ? this.data.filterCatName : '', formError: '' });
    this.updateDerived();
  },

  onWindowToggle(e) {
    if (this.data.ruleLocked) return;
    const rule = { ...this.data.form.rule };
    if (e.detail.value) rule.window = { start: today(), end: today() };
    else delete rule.window;
    this.setData({ 'form.rule': rule, formError: '' });
    this.updateDerived();
  },

  // 日期选择：开始晚于结束时联动另一端，保证窗口有效
  onWindowDate(e) {
    if (this.data.ruleLocked || !this.data.form.rule.window) return;
    const field = e.currentTarget.dataset.field;
    const window = { ...this.data.form.rule.window, [field]: e.detail.value };
    if (window.start > window.end) {
      if (field === 'start') window.end = window.start;
      else window.start = window.end;
    }
    this.setData({ 'form.rule.window': window, formError: '' });
    this.updateDerived();
  },

  openCatSelect() {
    if (this.data.ruleLocked) return;
    this.setData({ showCatSelect: true });
  },

  onCatSelect(e) {
    const cat = e.detail;
    this.setData({ showCatSelect: false });
    if (!cat?._id) return;
    const metric = this.data.metricOptions.find(item => item.key === this.data.form.rule.metric);
    // 浏览、关注指定猫猫只有看过 / 没看过，数量固定为 1
    this.setData({ 'form.rule.filter': { catId: cat._id }, ...(metric?.catDesc ? { 'form.rule.count': 1 } : {}), filterCatName: cat.name || cat._id, formError: '' });
    this.updateDerived();
  },

  onCatSelectClose() {
    this.setData({ showCatSelect: false });
  },

  clearFilterCat() {
    if (this.data.ruleLocked) return;
    const rule = { ...this.data.form.rule };
    delete rule.filter;
    this.setData({ 'form.rule': rule, filterCatName: '', formError: '' });
    this.updateDerived();
  },

  async loadFilterCatName() {
    const catId = this.data.form.rule?.filter?.catId;
    if (!catId) return;
    try {
      const { result: cat } = await app.mpServerless.db.collection('cat').findOne({ _id: catId });
      this.setData({ filterCatName: cat?.name || '猫猫已删除' });
    } catch (error) {
      this.setData({ filterCatName: catId });
    }
  },

  onStatusChange(e) {
    const status = e.currentTarget.dataset.status;
    if (!statusAllowed(this.data.originalStatus, status, this.data.holders)) return;
    this.setData({ 'form.status': status, formError: '' });
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
      if (this.data.mode === 'material') this.setData({ imageChanged: this.data.form.image !== this.data.originalImage });
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
      if (!form.series?.trim()) error = '请填写系列';
      else if (!this.data.metricOptions.some(item => item.key === form.rule.metric) || !Number.isInteger(Number(form.rule.count)) || Number(form.rule.count) < 1 || Number(form.rule.count) > 100000) error = '达成数量需为 1～100000 的整数';
      else if (form.rule.window && !(form.rule.window.start <= form.rule.window.end)) error = '时间窗口的开始日期不能晚于结束日期';
      else if (!this.data.selectedMaterial?.image) error = '请选择已上传图片的材质';
      else if (!form.frontImage) error = '请上传成就正面图片';
    }
    if (error) {
      this.setData({ formError: error });
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    this.setData({ saving: true, formError: '', generation: { label: '正在保存' } });
    const generationId = generateUUID();
    watchGeneration(this, mode === 'material' ? `material:${form.key}` : form.key, generationId);
    try {
      const data = mode === 'material'
        ? { ...form, isNew, generationId }
        : { ...form, isNew, generationId, sort: Number(form.sort) || 0, rule: ruleForSave(form.rule) };
      const result = await callCatalog(mode === 'material' ? 'saveMaterial' : 'saveBadge', data);
      let regenerated = result.regenerated || 0;
      let failed = result.failed || 0;
      if (mode === 'material') {
        let batch = result;
        let rounds = 0;
        while (batch.hasMore && rounds++ < 200) {
          this.setData({ generation: { label: `生成背面图 ${batch.done}/${batch.total}`, step: batch.done, total: batch.total } });
          batch = await callCatalog('regenerateMaterialBacks', { key: form.key, generationId });
          regenerated += batch.regenerated || 0;
          failed += batch.failed || 0;
        }
        if (batch.hasMore) throw new Error(`材质已保存，仍有 ${batch.remaining} 枚待生成，请再次保存继续`);
        if (failed) throw new Error(`材质已保存，${failed} 枚生成失败，请再次保存重试`);
      } else {
        let pending = result.pending;
        // 素材已生成完，停止轮询，避免进度被旧状态覆盖
        if (pending) stopGenerationWatch(this);
        while (pending) {
          this.setData({ generation: { label: '整理历史编号', step: 5, total: 6 } });
          pending = (await callCatalog('prepareBadge', { key: form.key, generationId })).pending;
        }
      }
      stopGenerationWatch(this);
      this.setData({ generation: { label: '保存完成', status: 'complete' } });
      clearAchievementCache();
      if (mode === 'material' && (regenerated || failed)) {
        await new Promise(resolve => wx.showModal({
          title: '材质已保存',
          content: `重新生成背面 ${regenerated} 枚${failed ? `，失败 ${failed} 枚，可再次保存重试` : ''}。`,
          showCancel: false,
          complete: resolve,
        }));
      } else {
        wx.showToast({ title: '已保存', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
      this.setData({ saving: false, formError: error.message || '保存失败', generation: { label: '保存未完成', status: 'failed' } });
    } finally { stopGenerationWatch(this); }
  },

  async remove() {
    if (this.data.saving || this.data.uploading || this.data.loading) return;
    const testing = this.data.originalStatus === 'test';
    if (this.data.mode !== 'badge' || this.data.isNew || (this.data.holders > 0 && !testing)) return;
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '删除成就',
      content: testing && this.data.holders > 0
        ? `确定删除「${this.data.form.name}」吗？${this.data.holders} 条测试记录会一并清掉。`
        : `确定删除「${this.data.form.name}」吗？`,
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
