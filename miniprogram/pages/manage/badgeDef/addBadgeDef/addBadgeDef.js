import { checkAuth } from '../../../../utils/user';
import { levelOrderMap } from '../../../../utils/badge';
import api from '../../../../utils/cloudApi';
import { generateUUID } from '../../../../utils/utils';
import { uploadFile, signCosUrl } from '../../../../utils/common';

const app = getApp();

Page({
  data: {
    levelDefs: Object.keys(levelOrderMap),
    levelIndex: 0,
    badgeDef: { name: '', desc: '', level: '', img: '', rankDesc: '' },
    imagePreview: '',
    isNew: true,
    loading: true,
    loadError: '',
    formError: '',
    saving: false,
    choosingImage: false,
  },

  async onLoad(options) {
    this.editorOptions = options;
    this.setData({ loading: true, loadError: '' });
    if (!await checkAuth(this, 2)) return;
    const id = options.id;
    wx.setNavigationBarTitle({ title: id ? '编辑猫猫徽章' : '添加猫猫徽章' });
    try {
      if (id) await this.loadBadgeDef(id);
    } catch (error) {
      this.setData({ loadError: error.message || '读取失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  retryLoad() { this.onLoad(this.editorOptions || {}); },

  async loadBadgeDef(id) {
    const { result } = await app.mpServerless.db.collection('badge_def').findOne({ _id: id });
    if (!result) throw new Error('未找到这个徽章');
    const img = (result.img || '').split('?')[0];
    this.setData({
      badgeDef: { ...result, img },
      imagePreview: img ? await signCosUrl(img) : '',
      isNew: false,
      levelIndex: Math.max(0, this.data.levelDefs.indexOf(result.level)),
    });
  },

  async chooseImage() {
    if (this.data.choosingImage || this.data.saving) return;
    this.setData({ choosingImage: true });
    try {
      const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'] });
      const file = result.tempFiles?.[0];
      if (!file?.tempFilePath) return;
      const info = await wx.getImageInfo({ src: file.tempFilePath });
      this.pendingImage = { path: file.tempFilePath, ext: /^[a-z0-9]+$/i.test(info.type || '') ? info.type : 'png' };
      this.setData({ imagePreview: file.tempFilePath, formError: '' });
    } catch (error) {
      if (!error.errMsg?.includes('cancel')) wx.showToast({ title: '图片读取失败，请重试', icon: 'none' });
    } finally {
      this.setData({ choosingImage: false });
    }
  },

  onChangeText(e) {
    this.setData({ [`badgeDef.${e.currentTarget.dataset.field}`]: e.detail.value, formError: '' });
  },

  onLevelChange(e) {
    const index = Number(e.detail.value);
    if (!this.data.levelDefs[index]) return;
    this.setData({ 'badgeDef.level': this.data.levelDefs[index], levelIndex: index, formError: '' });
  },

  async clickUpload() {
    if (!this.data.auth || this.data.loading || this.data.loadError || this.data.saving || this.data.choosingImage) return;
    const form = this.data.badgeDef;
    const error = !form.name?.trim() ? '请填写名称'
      : !form.desc?.trim() ? '请填写描述'
      : !this.data.levelDefs.includes(form.level) ? '请选择徽章等级'
      : !form.rankDesc?.trim() ? '请填写榜单标语'
      : !form.img && !this.pendingImage ? '请上传徽章图片' : '';
    if (error) {
      this.setData({ formError: error });
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    this.setData({ saving: true, formError: '' });
    try {
      let img = form.img;
      if (this.pendingImage) {
        const pending = this.pendingImage;
        const result = await uploadFile({ cloudPath: `/badgeDef/${generateUUID()}.${pending.ext}`, filePath: pending.path });
        if (!result?.fileUrl) throw new Error('图片上传失败，请重试');
        img = result.fileUrl.split('?')[0];
        this.setData({ 'badgeDef.img': img });
        this.pendingImage = null;
      }
      const data = { img, name: form.name.trim(), desc: form.desc.trim(), level: form.level, rankDesc: form.rankDesc.trim() };
      const result = await api.curdOp({ operation: form._id ? 'update' : 'add', collection: 'badge_def', ...(form._id ? { item_id: form._id } : {}), data });
      if (!result || typeof result !== 'object' || result.ok === false || (!form._id && !result.insertedId) || result.matchedCount === 0) {
        throw new Error(result?.errMsg || '徽章保存失败，请重试');
      }
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ saving: false, formError: error.message || '保存失败，请重试' });
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' });
    }
  },
});
