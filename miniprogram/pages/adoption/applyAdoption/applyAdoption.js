// 提交领养申请
import { getCatItem, getAvatar } from "../../../utils/cat";
import { getUser } from "../../../utils/user";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";

const app = getApp();

// 与 myAdoption 页保持一致的状态文案
const STATUS_DESC = {
  pending: '待审核',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '未通过',
  cancelled: '已撤销',
};

const STATUS_CLASS = {
  pending: 'status-pending',
  reviewing: 'status-reviewing',
  approved: 'status-approved',
  rejected: 'status-rejected',
  cancelled: 'status-cancelled',
};

// 只有已拒绝（或自己已撤销）的申请可以重新提交，与后端防重复规则对齐
function canResubmit(status) {
  return status === 'rejected' || status === 'cancelled';
}

Page({
  data: {
    cat: {},
    existing: null,
    form: {
      applicant_name: '',
      contact: '',
      reason: '',
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

    const cat = await getCatItem(this.jsData.cat_id);
    if (!cat) {
      wx.showToast({ title: '猫咪不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 只有"寻找领养中"的猫可以申请
    if (cat.adopt !== 2) {
      wx.showModal({
        title: '无法申请',
        content: '这只猫猫目前不在寻找领养中',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }

    // 头像（getCatItem返回的是原始猫文档，封面需单独获取）
    const avatar = await getAvatar(this.jsData.cat_id);
    this.setData({
      cat,
      avatarUrl: avatar ? (avatar.photo_compressed || avatar.photo_id) : '',
    });
    wx.setNavigationBarTitle({ title: `领养${cat.name}` });

    // 查询本人对该猫的历史申请：进行中则只展示状态，被拒才允许重新提交
    await this.loadMyApplication();

    // 预填昵称（被拒重交时已预填上次的称呼，则不覆盖）
    if (!this.data.form.applicant_name) {
      const user = await getUser();
      const nickname = user && user.userInfo && user.userInfo.nickName;
      if (nickname) {
        this.setData({ 'form.applicant_name': nickname });
      }
    }
  },

  async loadMyApplication() {
    try {
      const res = await api.adoptionOp({ operation: 'listMine' });
      // 查询失败不阻断页面：后端 apply 仍有防重复校验兜底
      if (!res.result) return;
      const mine = (res.data || []).find(item => item.cat_id === this.jsData.cat_id);
      if (!mine) return;

      this.setData({
        existing: {
          ...mine,
          statusDesc: STATUS_DESC[mine.status] || mine.status,
          statusClass: STATUS_CLASS[mine.status] || '',
          apply_time_formatted: formatDate(mine.apply_time, 'yyyy-MM-dd hh:mm'),
          review_time_formatted: mine.review_time ? formatDate(mine.review_time, 'yyyy-MM-dd hh:mm') : '',
        },
      });

      // 上次被拒：预填姓名和联系方式，方便修改后重新提交
      if (canResubmit(mine.status) && mine.applicant_name) {
        this.setData({ 'form.applicant_name': mine.applicant_name });
        if (mine.contact) {
          this.setData({ 'form.contact': mine.contact });
        }
      }
    } catch (err) {
      console.error('[loadMyApplication] - 查询历史申请失败:', err);
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value,
    });
  },

  async submit() {
    const { form, submitting } = this.data;
    if (submitting) return;

    if (!form.applicant_name.trim()) {
      wx.showToast({ title: '请填写姓名/称呼', icon: 'none' });
      return;
    }
    if (!form.contact.trim()) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }
    if (!form.reason.trim()) {
      wx.showToast({ title: '请填写申请理由', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    try {
      const res = await api.adoptionOp({
        operation: 'apply',
        data: {
          cat_id: this.jsData.cat_id,
          applicant_name: form.applicant_name.trim(),
          contact: form.contact.trim(),
          reason: form.reason.trim(),
        },
      });

      wx.hideLoading();
      if (res.result) {
        wx.showModal({
          title: '提交成功',
          content: res.msg || '申请已提交，请等待管理员审核。你可以在「我的-我的领养」中查看进度。',
          showCancel: false,
          success: () => wx.navigateBack(),
        });
      } else {
        wx.showModal({ title: '提交失败', content: res.msg || '请稍后重试', showCancel: false });
        this.setData({ submitting: false });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[submit] - 提交领养申请失败:', err);
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
