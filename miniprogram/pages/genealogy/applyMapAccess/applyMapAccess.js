import { getUser, getPageUserInfo } from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { isDemoMode } from "../../../utils/demo";

const app = getApp();

Page({
  data: {
    isAuth: false,
    user: {},
    reason: '',
    reasonLength: 0,
    maxlength: 200,
    photoCount: 0,
    commentCount: 0,
    minRequired: 2,
    meetRequirement: false,
    submitting: false,
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    getPageUserInfo(this);
  },

  async loadUserData() {
    if (isDemoMode()) {
      this.setData({ isAuth: true, photoCount: 5, commentCount: 3, meetRequirement: true });
      return;
    }
    const user = await getUser();
    if (!user || !user.openid) return;

    try {
      const { result: photos } = await app.mpServerless.db.collection('photo').where({ openid: user.openid }).get();
      const { result: comments } = await app.mpServerless.db.collection('comment').where({ openid: user.openid }).get();
      const photoCount = (photos || []).length;
      const commentCount = (comments || []).length;
      this.setData({
        photoCount,
        commentCount,
        meetRequirement: (photoCount + commentCount) >= this.data.minRequired,
        isAuth: true,
      });
    } catch (e) {
      console.warn('加载用户数据失败:', e);
      this.setData({ isAuth: true });
    }
  },

  bindInput(e) {
    const value = e.detail.value || '';
    this.setData({ reason: value, reasonLength: value.length });
  },

  async bindSubmit(e) {
    if (this.data.submitting) return;
    const reason = (e.detail.value.reason || '').trim();
    if (!reason) {
      wx.showToast({ title: '请填写申请理由', icon: 'none' });
      return;
    }
    if (reason.length < 5) {
      wx.showToast({ title: '申请理由至少5个字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      if (isDemoMode()) {
        await new Promise(resolve => setTimeout(resolve, 500));
        wx.showToast({ title: '申请已提交，请等待管理员审核', icon: 'success' });
      } else {
        const user = await getUser();
        await api.curdOp({
          operation: "add",
          collection: "map_access",
          data: {
            openid: user.openid,
            reason: reason,
            status: "pending",
            createDate: api.getDate(),
            photoCount: this.data.photoCount,
            commentCount: this.data.commentCount,
          }
        });
        wx.showToast({ title: '申请已提交，请等待管理员审核', icon: 'success' });
      }
      setTimeout(() => { wx.navigateBack(); }, 1500);
    } catch (e) {
      console.error('提交申请失败:', e);
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
