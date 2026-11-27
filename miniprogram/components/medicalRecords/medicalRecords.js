import { confirmDiscard } from "../../utils/popup";
import api from "../../utils/cloudApi";
import { formatDate, compressImage, generateUUID } from "../../utils/utils";
import { uploadFile, signCosUrl } from "../../utils/common";
import { isDemoMode } from "../../utils/demo";

const TYPES = [
  { key: 'vaccine', name: '疫苗' },
  { key: 'sterilize', name: '绝育' },
  { key: 'clinic', name: '就诊' },
  { key: 'deworm', name: '驱虫' },
  { key: 'injury', name: '伤病' },
  { key: 'other', name: '其他' },
];
const TYPE_NAMES = Object.fromEntries(TYPES.map(({ key, name }) => [key, name]));

// 疫苗照片：1-3 张
const MAX_PHOTOS = 3;
const PHOTO_COMPRESS_THRESHOLD = 512 * 1024;

function emptyForm() {
  return {
    typeIndex: 0,
    title: '',
    record_date: formatDate(new Date(), 'yyyy-MM-dd'),
    hospital: '',
    description: '',
    expire_date: '',
    next_vaccine_date: '',
    photos: [],
    // 主导人：非必填。owner 是展示名，owner_openid 仅在「从用户中选择」时回填
    owner: '',
    owner_openid: '',
  };
}

function displayRecord(record) {
  const photos = Array.isArray(record.photos) ? record.photos : [];
  return {
    ...record,
    photos,
    photoCount: photos.length,
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
    // 照片的「签名后」地址，仅供展示；form.photos 里始终存未签名原始 URL（入库用）
    photoViews: [],
    // 主导人选择面板
    showUserPicker: false,
    pickerKeyword: '',
    pickerUsers: [],
    pickerLoading: false,
    submitting: false,
    canSaveRecord: false,
  },

  observers: {
    'form.**': function () {
      const form = this.data.form;
      const type = TYPES[form.typeIndex]?.key;
      this.setData({ canSaveRecord: !!(type && form.record_date && (type === 'sterilize' || form.title.trim())) });
    },
    showEditor(show) {
      if (show) this._initialForm = JSON.parse(JSON.stringify(this.data.form));
    },
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
      this.setData({
        editingId: '',
        form: emptyForm(),
        photoViews: [],
        showUserPicker: false,
        pickerKeyword: '',
        pickerUsers: [],
        showEditor: true,
      });
    },

    tapRecord(e) {
      if (this._suppressRecordTap) return;
      this.openRecordDetail(e);
    },

    // 点击记录卡片：打开完整的医疗记录详情页（照片不在列表里展开）
    openRecordDetail(e) {
      const recordId = e.currentTarget.dataset.id;
      if (!recordId) return;
      const catId = this.properties.catId;
      wx.navigateTo({
        url: `/pages/genealogy/detailCat/medicalDetail/medicalDetail?record_id=${recordId}&cat_id=${catId}`,
      });
    },

    async editRecord(e) {
      const record = this.data.records.find(item => item._id === e.currentTarget.dataset.id);
      if (!record) return;
      this.closeSwipeActions();
      const photos = (record.photos || []).slice(0, MAX_PHOTOS);
      this.setData({
        editingId: record._id,
        showEditor: true,
        photoViews: [],
        showUserPicker: false,
        pickerKeyword: '',
        pickerUsers: [],
        form: {
          typeIndex: Math.max(0, TYPES.findIndex(type => type.key === record.type)),
          title: record.title || '',
          record_date: record.record_date_formatted,
          hospital: record.hospital || '',
          description: record.description || '',
          expire_date: record.expire_date_formatted,
          next_vaccine_date: record.next_vaccine_date_formatted,
          photos,
          owner: record.owner || '',
          owner_openid: record.owner_openid || '',
        },
      });
      // 私有读桶：库里存的是裸地址，展示前必须签名，否则 403（图片空白）
      await this.refreshPhotoViews(photos);
    },

    async closeEditor() {
      if (this.data.submitting) return;
      if (await confirmDiscard(this, this._initialForm, this.data.form)) this.setData({ showEditor: false });
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

    // ---- 主导人（非必填）：手输 or 从用户里勾选 ----
    onOwnerInput(e) {
      // 手输后清掉之前勾选的 openid，避免「显示名和账号对不上」
      this.setData({ 'form.owner': e.detail.value, 'form.owner_openid': '' });
    },

    clearOwner() {
      this.setData({ 'form.owner': '', 'form.owner_openid': '' });
    },

    async openUserPicker() {
      const next = !this.data.showUserPicker;
      this.setData({ showUserPicker: next });
      if (next && !this.data.pickerUsers.length) await this.loadPickerUsers('');
    },

    async loadPickerUsers(keyword) {
      if (this._loadingUsers) return;
      this._loadingUsers = true;
      this.setData({ pickerLoading: true });
      try {
        const res = await api.userOp({ op: 'list', keyword: keyword || '', limit: 30 });
        const list = (res && res.result) || [];
        const users = await Promise.all(list.map(async item => {
          let avatar = item.avatarUrl || '';
          if (avatar) {
            try {
              avatar = await signCosUrl(avatar);
            } catch (error) {
              console.warn('[medicalRecords] 头像签名失败', error);
            }
          }
          return { openid: item.openid || '', name: item.name || '', avatar };
        }));
        this.setData({ pickerUsers: users.filter(item => item.name) });
      } catch (error) {
        console.error('[medicalRecords] 用户列表加载失败', error);
        wx.showToast({ title: '用户列表加载失败', icon: 'none' });
        this.setData({ pickerUsers: [] });
      } finally {
        this._loadingUsers = false;
        this.setData({ pickerLoading: false });
      }
    },

    onPickerKeyword(e) {
      const keyword = e.detail.value;
      this.setData({ pickerKeyword: keyword });
      clearTimeout(this._pickerTimer);
      this._pickerTimer = setTimeout(() => this.loadPickerUsers(keyword.trim()), 350);
    },

    pickUser(e) {
      const { openid, name } = e.currentTarget.dataset;
      this.setData({
        'form.owner': name || '',
        'form.owner_openid': openid || '',
        showUserPicker: false,
      });
    },

    // ---- 记录照片（1-3 张，所有医疗类型通用） ----
    // 把裸 COS 地址换成带签名的展示地址（签名有时效，只用于渲染，绝不写库）
    async refreshPhotoViews(rawPhotos) {
      const list = Array.isArray(rawPhotos) ? rawPhotos : [];
      const views = await Promise.all(list.map(async url => {
        if (!url || typeof url !== 'string') return '';
        try {
          return await signCosUrl(url);
        } catch (error) {
          console.warn('[medicalRecords] 照片签名失败', error);
          return url;
        }
      }));
      this.setData({ photoViews: views });
    },

    previewFormPhoto(e) {
      const views = (this.data.photoViews && this.data.photoViews.length)
        ? this.data.photoViews
        : (this.data.form.photos || []);
      if (!views.length) return;
      const index = Number(e.currentTarget.dataset.index) || 0;
      wx.previewImage({ current: views[index], urls: views });
    },

    removeFormPhoto(e) {
      const index = Number(e.currentTarget.dataset.index);
      const photos = (this.data.form.photos || []).slice();
      photos.splice(index, 1);
      const views = (this.data.photoViews || []).slice();
      views.splice(index, 1);
      this.setData({ 'form.photos': photos, photoViews: views });
    },

    async chooseRecordPhotos() {
      if (this._uploadingPhoto) return;
      const current = this.data.form.photos || [];
      const remain = MAX_PHOTOS - current.length;
      if (remain <= 0) {
        wx.showToast({ title: `最多 ${MAX_PHOTOS} 张照片`, icon: 'none' });
        return;
      }
      let picked;
      try {
        picked = await wx.chooseMedia({
          count: remain,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        });
      } catch (error) {
        return; // 用户取消
      }
      const files = (picked && picked.tempFiles) || [];
      if (!files.length) return;

      this._uploadingPhoto = true;
      wx.showLoading({ title: '上传中...', mask: true });
      const uploaded = [];
      try {
        for (const file of files) {
          let filePath = file.tempFilePath;
          if (file.size > PHOTO_COMPRESS_THRESHOLD) {
            try {
              filePath = await compressImage(filePath, 80);
            } catch (error) {
              console.warn('[medicalRecords] 压缩失败，改用原图', error);
            }
          }
          if (isDemoMode()) {
            uploaded.push(filePath);
            continue;
          }
          const dot = filePath.lastIndexOf('.');
          const ext = dot > -1 ? filePath.slice(dot + 1) : 'jpg';
          const res = await uploadFile({
            filePath,
            cloudPath: `/medical/${this.properties.catId}/${generateUUID()}.${ext}`,
          });
          if (res && res.fileUrl) uploaded.push(res.fileUrl);
        }
      } catch (error) {
        console.error('[medicalRecords] 照片上传失败', error);
      } finally {
        wx.hideLoading();
        this._uploadingPhoto = false;
      }

      if (!uploaded.length) {
        wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
        return;
      }
      const nextPhotos = (this.data.form.photos || []).concat(uploaded).slice(0, MAX_PHOTOS);
      this.setData({ 'form.photos': nextPhotos });
      // 刚上传拿到的是裸地址，私有桶同样需要签名才能预览
      await this.refreshPhotoViews(nextPhotos);
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
        // 照片：所有类型都支持，最多 3 张（旧记录后续补图也走这里）
        photos: (form.photos || []).slice(0, MAX_PHOTOS),
        // 主导人：非必填（勾选用户时带上 openid）
        owner: (form.owner || '').trim(),
        owner_openid: form.owner_openid || '',
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
      this._suppressRecordTap = false;
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
      this._suppressRecordTap = swipe.moved || swipe.vertical || e.type === 'touchcancel';
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
