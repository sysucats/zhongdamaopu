import { getUser, getPageUserInfo } from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { isDemoMode } from "../../../utils/demo";
import { formatDate } from "../../../utils/utils";
import config from "../../../config";

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
    minRequired: config.mapAccessMinRequired,
    autoPassCount: config.mapAccessAutoPassCount,
    meetRequirement: false,
    autoPass: false,
    submitting: false,
    // 申请状态
    applyStatus: '',      // 'none' | 'pending' | 'approved' | 'rejected'
    statusInfo: null,     // mapAccess 对象
    loading: true,
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    getPageUserInfo(this);
  },

  async loadUserData() {
    if (isDemoMode()) {
      this.setData({
        loading: false,
        isAuth: true,
        photoCount: 5,
        commentCount: 3,
        meetRequirement: true,
        applyStatus: 'none',
      });
      return;
    }
    const user = await getUser({ nocache: true });
    if (!user || !user.openid) return;

    try {
      const { result: photoCount } = await app.mpServerless.db.collection('photo').count({ _openid: user.openid });
      const { result: commentCount } = await app.mpServerless.db.collection('comment').count({ user_openid: user.openid });
      const totalCount = photoCount + commentCount;
      const autoPass = totalCount >= this.data.autoPassCount;

      // 解析当前申请状态
      let applyStatus = 'none';
      let statusInfo = null;
      if (user.mapAccess && user.mapAccess.status === 'approved') {
        applyStatus = 'approved';
        statusInfo = { ...user.mapAccess, applyDate: formatDate(user.mapAccess.applyDate, 'yyyy年MM月dd日 hh:mm:ss') };
      } else if (user.mapAccess && user.mapAccess.status === 'pending') {
        applyStatus = 'pending';
        statusInfo = { ...user.mapAccess, applyDate: formatDate(user.mapAccess.applyDate, 'yyyy年MM月dd日 hh:mm:ss') };
      } else if (user.mapAccess === null) {
        applyStatus = 'rejected';
        statusInfo = null;
      }

      this.setData({
        loading: false,
        photoCount,
        commentCount,
        meetRequirement: totalCount >= this.data.minRequired,
        autoPass,
        isAuth: true,
        applyStatus,
        statusInfo,
        user,
      });
    } catch (e) {
      console.warn('加载用户数据失败:', e);
      this.setData({ loading: false, isAuth: true });
    }
  },

  // 重新申请（被拒绝后）
  onReapply() {
    this.setData({ applyStatus: 'none', reason: '', reasonLength: 0 });
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
      } else {
        const user = await getUser();
        // 超过xxx张自动通过，无需审批
        const status = this.data.autoPass ? 'approved' : 'pending';
        await api.curdOp({
          operation: "update",
          collection: "user",
          item_id: user._id,
          data: {
            mapAccess: {
              status: status,
              applyReason: reason,
              applyDate: api.getDate(),
              autoPass: this.data.autoPass,
            }
          }
        });
      }

      if (this.data.autoPass) {
        wx.showToast({ title: '申请已自动通过', icon: 'success' });
        this.setData({
          applyStatus: 'approved',
          statusInfo: {
            status: 'approved',
            applyReason: reason,
            autoPass: true,
            applyDate: formatDate(new Date(), 'yyyy年MM月dd日 hh:mm:ss'),
          },
          submitting: false,
        });
      } else {
        wx.showToast({ title: '申请已提交，等待审核', icon: 'success' });
        this.setData({
          applyStatus: 'pending',
          statusInfo: {
            status: 'pending',
            applyReason: reason,
            applyDate: formatDate(new Date(), 'yyyy年MM月dd日 hh:mm:ss'),
          },
          submitting: false,
        });
      }
    } catch (e) {
      console.error('提交申请失败:', e);
      wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
