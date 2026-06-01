import { checkAuth } from "../../../utils/user";
import { signCosUrl } from "../../../utils/common";
import api from "../../../utils/cloudApi";
import { isDemoMode } from "../../../utils/demo";

const app = getApp();

Page({
  data: {
    auth: false,
    icons: [],
  },

  onLoad() {
    this.init();
  },

  async init() {
    const isAuth = await checkAuth(this, 2);
    if (!isAuth) return;
    this.loadIcons();
  },

  onShow() {
    if (this.data.auth) this.loadIcons();
  },

  async loadIcons() {
    try {
      if (isDemoMode()) {
        const { DEMO_MARKER_ICONS } = require('../../../utils/demo');
        this.setData({ icons: DEMO_MARKER_ICONS });
        return;
      }
      const { result: icons } = await app.mpServerless.db.collection('marker_icon').find({});
      for (let icon of (icons || [])) {
        icon.img = await signCosUrl(icon.img);
      }
      this.setData({ icons: icons || [] });
    } catch (e) {
      console.error('加载标记图标失败:', e);
    }
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const url = id
      ? `/pages/manage/markerIcon/editMarkerIcon/editMarkerIcon?id=${id}`
      : '/pages/manage/markerIcon/editMarkerIcon/editMarkerIcon';
    wx.navigateTo({ url });
  },

  async toggleEnabled(e) {
    const index = e.currentTarget.dataset.index;
    const icon = this.data.icons[index];
    if (!icon) return;
    const newVal = !icon.enabled;
    this.setData({ [`icons[${index}].enabled`]: newVal });

    try {
      if (isDemoMode()) return;
      await api.curdOp({
        operation: "update",
        collection: "marker_icon",
        item_id: icon._id,
        data: { enabled: newVal }
      });
    } catch (err) {
      this.setData({ [`icons[${index}].enabled`]: !newVal });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
