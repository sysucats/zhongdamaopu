import api from "../../../../utils/cloudApi";
import { uploadFile, signCosUrl } from "../../../../utils/common";
import { generateUUID } from "../../../../utils/utils";
import { isDemoMode } from "../../../../utils/demo";

const app = getApp();

Page({
  data: {
    isEdit: false,
    icon: {
      name: '',
      img: '',
      enabled: true,
    },
    uploading: false,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true });
      this.loadIcon(options.id);
    }
  },

  async loadIcon(id) {
    try {
      if (isDemoMode()) {
        const { DEMO_MARKER_ICONS } = require('../../../../utils/demo');
        const icon = DEMO_MARKER_ICONS.find(i => i._id === id);
        if (icon) this.setData({ icon: { ...icon } });
        return;
      }
      const { result } = await app.mpServerless.db.collection('marker_icon').findOne({ _id: id });
      if (result) {
        result.img = await signCosUrl(result.img);
        this.setData({ icon: result });
      }
    } catch (e) {
      console.error('加载图标失败:', e);
    }
  },

  async chooseImage() {
    const res = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album'] });
    const tempPath = res.tempFiles[0].tempFilePath;
    this.setData({ ['icon.img']: tempPath });
  },

  onChangeText(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`icon.${field}`]: e.detail.value });
  },

  async onSave() {
    const { icon, isEdit } = this.data;
    if (!icon.name || !icon.img) {
      wx.showToast({ title: '请填写名称并选择图标', icon: 'none' });
      return;
    }

    this.setData({ uploading: true });

    try {
      let imgUrl = icon.img;

      // 仅对临时文件上传到COS
      if (icon.img.startsWith('http://tmp') || icon.img.startsWith('wxfile://')) {
        const ext = icon.img.split('.').pop() || 'jpg';
        const upRes = await uploadFile({
          filePath: icon.img,
          cloudPath: `/markerIcon/${generateUUID()}.${ext}`,
        });
        imgUrl = upRes.fileUrl.split('?')[0];
      }

      const data = {
        name: icon.name,
        img: imgUrl,
        enabled: icon.enabled !== false,
      };

      if (isDemoMode()) {
        wx.showToast({ title: isEdit ? '已更新' : '已创建', icon: 'success' });
      } else if (isEdit) {
        await api.curdOp({ operation: "update", collection: "marker_icon", item_id: icon._id, data });
        wx.showToast({ title: '已更新', icon: 'success' });
      } else {
        const res = await api.curdOp({ operation: "add", collection: "marker_icon", data });
        this.setData({ isEdit: true, ['icon._id']: res.insertedId });
        wx.showToast({ title: '已创建', icon: 'success' });
      }

      setTimeout(() => wx.navigateBack(), 1000);
    } catch (e) {
      console.error('保存失败:', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },
});
